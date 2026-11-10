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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      active_show_token_devices: {
        Row: {
          browser_id: string
          created_at: string
          id: string
          token_id: string
        }
        Insert: {
          browser_id: string
          created_at?: string
          id?: string
          token_id: string
        }
        Update: {
          browser_id?: string
          created_at?: string
          id?: string
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_show_token_devices_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "active_show_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      active_show_tokens: {
        Row: {
          created_at: string
          expires_at: string | null
          group_link_override: string | null
          id: string
          kind: string
          label: string
          manual_resets_max: number
          manual_resets_used: number
          max_devices: number
          revoked: boolean
          show_id: string
          single_use: boolean
          token: string
          used_at: string | null
          used_by_browser_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          group_link_override?: string | null
          id?: string
          kind?: string
          label?: string
          manual_resets_max?: number
          manual_resets_used?: number
          max_devices?: number
          revoked?: boolean
          show_id: string
          single_use?: boolean
          token: string
          used_at?: string | null
          used_by_browser_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          group_link_override?: string | null
          id?: string
          kind?: string
          label?: string
          manual_resets_max?: number
          manual_resets_used?: number
          max_devices?: number
          revoked?: boolean
          show_id?: string
          single_use?: boolean
          token?: string
          used_at?: string | null
          used_by_browser_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "active_show_tokens_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "active_shows"
            referencedColumns: ["id"]
          },
        ]
      }
      active_shows: {
        Row: {
          admin_alias: string | null
          category: string
          created_at: string
          description: string
          featured_member: string
          group_link: string
          group_link_enabled: boolean
          group_link_label: string
          group_link_note: string
          id: string
          idn_show_id: string
          image_url: string
          is_active: boolean
          is_live: boolean
          is_special: boolean
          lineup: string[]
          live_auto_schedule: boolean
          live_hold_until: string | null
          live_password: string
          live_require_password: boolean
          live_sources: Json
          live_type: string
          live_url: string
          pakasir_amount: number
          price_replay: number
          price_replay_coins: number
          price_show: number
          price_show_coins: number
          replay_enabled: boolean
          replay_id: string | null
          replay_info: string
          replay_m3u8_url: string
          replay_mode: boolean
          replay_youtube_url: string
          server2_url: string
          server3_url: string
          short_title: string
          show_date: string
          show_time: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          admin_alias?: string | null
          category?: string
          created_at?: string
          description?: string
          featured_member?: string
          group_link?: string
          group_link_enabled?: boolean
          group_link_label?: string
          group_link_note?: string
          id?: string
          idn_show_id?: string
          image_url?: string
          is_active?: boolean
          is_live?: boolean
          is_special?: boolean
          lineup?: string[]
          live_auto_schedule?: boolean
          live_hold_until?: string | null
          live_password?: string
          live_require_password?: boolean
          live_sources?: Json
          live_type?: string
          live_url?: string
          pakasir_amount?: number
          price_replay?: number
          price_replay_coins?: number
          price_show?: number
          price_show_coins?: number
          replay_enabled?: boolean
          replay_id?: string | null
          replay_info?: string
          replay_m3u8_url?: string
          replay_mode?: boolean
          replay_youtube_url?: string
          server2_url?: string
          server3_url?: string
          short_title?: string
          show_date: string
          show_time?: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          admin_alias?: string | null
          category?: string
          created_at?: string
          description?: string
          featured_member?: string
          group_link?: string
          group_link_enabled?: boolean
          group_link_label?: string
          group_link_note?: string
          id?: string
          idn_show_id?: string
          image_url?: string
          is_active?: boolean
          is_live?: boolean
          is_special?: boolean
          lineup?: string[]
          live_auto_schedule?: boolean
          live_hold_until?: string | null
          live_password?: string
          live_require_password?: boolean
          live_sources?: Json
          live_type?: string
          live_url?: string
          pakasir_amount?: number
          price_replay?: number
          price_replay_coins?: number
          price_show?: number
          price_show_coins?: number
          replay_enabled?: boolean
          replay_id?: string | null
          replay_info?: string
          replay_m3u8_url?: string
          replay_mode?: boolean
          replay_youtube_url?: string
          server2_url?: string
          server3_url?: string
          short_title?: string
          show_date?: string
          show_time?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_action_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          affected_count: number
          created_at: string
          details: Json
          filter: Json
          id: string
          order_ids: string[]
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          affected_count?: number
          created_at?: string
          details?: Json
          filter?: Json
          id?: string
          order_ids?: string[]
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          affected_count?: number
          created_at?: string
          details?: Json
          filter?: Json
          id?: string
          order_ids?: string[]
        }
        Relationships: []
      }
      blocked_browsers: {
        Row: {
          browser_id: string
          created_at: string
          id: string
          reason: string
          unblocked: boolean
          updated_at: string
        }
        Insert: {
          browser_id: string
          created_at?: string
          id?: string
          reason?: string
          unblocked?: boolean
          updated_at?: string
        }
        Update: {
          browser_id?: string
          created_at?: string
          id?: string
          reason?: string
          unblocked?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      blocked_ips: {
        Row: {
          auto_blocked: boolean
          blocked_at: string
          created_at: string
          created_by: string | null
          id: string
          ip: unknown
          is_active: boolean
          reason: string
          unblocked_at: string | null
          updated_at: string
        }
        Insert: {
          auto_blocked?: boolean
          blocked_at?: string
          created_at?: string
          created_by?: string | null
          id?: string
          ip: unknown
          is_active?: boolean
          reason?: string
          unblocked_at?: string | null
          updated_at?: string
        }
        Update: {
          auto_blocked?: boolean
          blocked_at?: string
          created_at?: string
          created_by?: string | null
          id?: string
          ip?: unknown
          is_active?: boolean
          reason?: string
          unblocked_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      blocked_users: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          email: string
          id: string
          phone: string
          reason: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          phone?: string
          reason?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          phone?: string
          reason?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      bot_admins: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          label: string
          last_login_at: string | null
          phone: string
          pin: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          last_login_at?: string | null
          phone: string
          pin?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          last_login_at?: string | null
          phone?: string
          pin?: string
          updated_at?: string
        }
        Relationships: []
      }
      bot_commands: {
        Row: {
          created_at: string
          description: string
          enabled: boolean
          id: string
          is_dynamic: boolean
          response_template: string
          sort_order: number
          trigger: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          enabled?: boolean
          id?: string
          is_dynamic?: boolean
          response_template?: string
          sort_order?: number
          trigger: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          enabled?: boolean
          id?: string
          is_dynamic?: boolean
          response_template?: string
          sort_order?: number
          trigger?: string
          updated_at?: string
        }
        Relationships: []
      }
      bot_inbox_dedup: {
        Row: {
          id: string
          message_hash: string
          phone: string
          received_at: string
        }
        Insert: {
          id?: string
          message_hash: string
          phone: string
          received_at?: string
        }
        Update: {
          id?: string
          message_hash?: string
          phone?: string
          received_at?: string
        }
        Relationships: []
      }
      bot_inbox_events: {
        Row: {
          command: string | null
          created_at: string
          detail: Json | null
          device: string | null
          event_name: string
          from_me: boolean | null
          id: string
          inbox_id: string | null
          message: string | null
          phone: string | null
        }
        Insert: {
          command?: string | null
          created_at?: string
          detail?: Json | null
          device?: string | null
          event_name: string
          from_me?: boolean | null
          id?: string
          inbox_id?: string | null
          message?: string | null
          phone?: string | null
        }
        Update: {
          command?: string | null
          created_at?: string
          detail?: Json | null
          device?: string | null
          event_name?: string
          from_me?: boolean | null
          id?: string
          inbox_id?: string | null
          message?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      bot_rate_limit: {
        Row: {
          last_sent_at: string
          phone: string
        }
        Insert: {
          last_sent_at?: string
          phone: string
        }
        Update: {
          last_sent_at?: string
          phone?: string
        }
        Relationships: []
      }
      chat_blocks: {
        Row: {
          browser_id: string
          created_at: string
          id: string
          last_name: string
          reason: string
        }
        Insert: {
          browser_id: string
          created_at?: string
          id?: string
          last_name?: string
          reason?: string
        }
        Update: {
          browser_id?: string
          created_at?: string
          id?: string
          last_name?: string
          reason?: string
        }
        Relationships: []
      }
      coin_balances: {
        Row: {
          balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      coin_packages: {
        Row: {
          coins: number
          created_at: string
          enabled: boolean
          id: string
          label: string
          price_idr: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          coins?: number
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          price_idr?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          coins?: number
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          price_idr?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      coin_transactions: {
        Row: {
          created_at: string
          delta: number
          id: string
          meta: Json
          reason: string
          related_order_id: string | null
          related_replay_id: string | null
          related_show_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          meta?: Json
          reason: string
          related_order_id?: string | null
          related_replay_id?: string | null
          related_show_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          meta?: Json
          reason?: string
          related_order_id?: string | null
          related_replay_id?: string | null
          related_show_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          created_at: string
          id: string
          message: string
          name: string
          replay_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          name?: string
          replay_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          name?: string
          replay_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_replay_id_fkey"
            columns: ["replay_id"]
            isOneToOne: false
            referencedRelation: "replays"
            referencedColumns: ["id"]
          },
        ]
      }
      doku_transactions: {
        Row: {
          amount: number
          checked_at: string | null
          created_at: string
          environment: string
          expires_at: string | null
          order_id: string
          qr_content: string | null
          reference_no: string | null
          status: string
        }
        Insert: {
          amount: number
          checked_at?: string | null
          created_at?: string
          environment?: string
          expires_at?: string | null
          order_id: string
          qr_content?: string | null
          reference_no?: string | null
          status?: string
        }
        Update: {
          amount?: number
          checked_at?: string | null
          created_at?: string
          environment?: string
          expires_at?: string | null
          order_id?: string
          qr_content?: string | null
          reference_no?: string | null
          status?: string
        }
        Relationships: []
      }
      free_sessions: {
        Row: {
          created_at: string
          expires_at: string
          fingerprint: string
          id: string
          ip: string
          show_id: string | null
          user_agent: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          fingerprint: string
          id?: string
          ip?: string
          show_id?: string | null
          user_agent?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          fingerprint?: string
          id?: string
          ip?: string
          show_id?: string | null
          user_agent?: string
        }
        Relationships: []
      }
      game_entries: {
        Row: {
          answers: Json
          browser_id: string | null
          correct_count: number
          created_at: string
          device_fp: string | null
          id: string
          ip_hash: string | null
          prize: Json | null
          round_id: string
          total: number
          user_id: string | null
          won: boolean
        }
        Insert: {
          answers?: Json
          browser_id?: string | null
          correct_count?: number
          created_at?: string
          device_fp?: string | null
          id?: string
          ip_hash?: string | null
          prize?: Json | null
          round_id: string
          total?: number
          user_id?: string | null
          won?: boolean
        }
        Update: {
          answers?: Json
          browser_id?: string | null
          correct_count?: number
          created_at?: string
          device_fp?: string | null
          id?: string
          ip_hash?: string | null
          prize?: Json | null
          round_id?: string
          total?: number
          user_id?: string | null
          won?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "game_entries_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "game_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      game_questions: {
        Row: {
          alt_answers: string[]
          answer: string
          choices: string[]
          created_at: string
          id: string
          image_url: string
          prompt: string
          reveal_image_url: string
          round_id: string
          sort_order: number
        }
        Insert: {
          alt_answers?: string[]
          answer?: string
          choices?: string[]
          created_at?: string
          id?: string
          image_url?: string
          prompt?: string
          reveal_image_url?: string
          round_id: string
          sort_order?: number
        }
        Update: {
          alt_answers?: string[]
          answer?: string
          choices?: string[]
          created_at?: string
          id?: string
          image_url?: string
          prompt?: string
          reveal_image_url?: string
          round_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_questions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "game_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      game_rounds: {
        Row: {
          created_at: string
          description: string
          ends_at: string
          game_type: string
          id: string
          images_cleaned: boolean
          is_published: boolean
          prize_seconds: number
          prizes: Json
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          ends_at?: string
          game_type?: string
          id?: string
          images_cleaned?: boolean
          is_published?: boolean
          prize_seconds?: number
          prizes?: Json
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          ends_at?: string
          game_type?: string
          id?: string
          images_cleaned?: boolean
          is_published?: boolean
          prize_seconds?: number
          prizes?: Json
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      game_views: {
        Row: {
          answer: string | null
          answered_at: string | null
          id: string
          ident: string
          question_id: string
          round_id: string
          started_at: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          id?: string
          ident: string
          question_id: string
          round_id: string
          started_at?: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          id?: string
          ident?: string
          question_id?: string
          round_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_views_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "game_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      game_wins: {
        Row: {
          bundle_id: string | null
          created_at: string
          id: string
          kind: string
          prize: Json
          round_title: string
          show_id: string | null
          user_id: string
        }
        Insert: {
          bundle_id?: string | null
          created_at?: string
          id?: string
          kind: string
          prize?: Json
          round_title?: string
          show_id?: string | null
          user_id: string
        }
        Update: {
          bundle_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          prize?: Json
          round_title?: string
          show_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_wins_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "show_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_wins_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "active_shows"
            referencedColumns: ["id"]
          },
        ]
      }
      ip_visit_log: {
        Row: {
          endpoint: string
          first_seen_at: string
          id: string
          ip: unknown
          last_seen_at: string
          path: string
          user_agent: string
          visit_count: number
        }
        Insert: {
          endpoint?: string
          first_seen_at?: string
          id?: string
          ip: unknown
          last_seen_at?: string
          path?: string
          user_agent?: string
          visit_count?: number
        }
        Update: {
          endpoint?: string
          first_seen_at?: string
          id?: string
          ip?: unknown
          last_seen_at?: string
          path?: string
          user_agent?: string
          visit_count?: number
        }
        Relationships: []
      }
      live_config_private: {
        Row: {
          enabled: boolean
          id: string
          lineup: string[]
          password: string
          require_password: boolean
          sources: Json
          title: string
          type: string
          updated_at: string
          url: string
        }
        Insert: {
          enabled?: boolean
          id?: string
          lineup?: string[]
          password?: string
          require_password?: boolean
          sources?: Json
          title?: string
          type?: string
          updated_at?: string
          url?: string
        }
        Update: {
          enabled?: boolean
          id?: string
          lineup?: string[]
          password?: string
          require_password?: boolean
          sources?: Json
          title?: string
          type?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      live_message_senders: {
        Row: {
          browser_id: string
          created_at: string
          created_by: string
          message_id: string
          phone: string
          token_kind: string
          token_tail: string
          user_id: string | null
        }
        Insert: {
          browser_id?: string
          created_at?: string
          created_by?: string
          message_id: string
          phone?: string
          token_kind?: string
          token_tail?: string
          user_id?: string | null
        }
        Update: {
          browser_id?: string
          created_at?: string
          created_by?: string
          message_id?: string
          phone?: string
          token_kind?: string
          token_tail?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_message_senders_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "live_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      live_messages: {
        Row: {
          browser_id: string
          created_at: string
          id: string
          is_admin: boolean
          message: string
          name: string
          pinned: boolean
          reply_to_id: string | null
          sender_role: string
          show_id: string | null
          user_id: string | null
        }
        Insert: {
          browser_id?: string
          created_at?: string
          id?: string
          is_admin?: boolean
          message: string
          name?: string
          pinned?: boolean
          reply_to_id?: string | null
          sender_role?: string
          show_id?: string | null
          user_id?: string | null
        }
        Update: {
          browser_id?: string
          created_at?: string
          id?: string
          is_admin?: boolean
          message?: string
          name?: string
          pinned?: boolean
          reply_to_id?: string | null
          sender_role?: string
          show_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      live_token_devices: {
        Row: {
          browser_id: string
          created_at: string
          id: string
          token_id: string
        }
        Insert: {
          browser_id: string
          created_at?: string
          id?: string
          token_id: string
        }
        Update: {
          browser_id?: string
          created_at?: string
          id?: string
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_token_devices_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "live_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      live_tokens: {
        Row: {
          created_at: string
          id: string
          label: string
          manual_resets_max: number
          manual_resets_used: number
          max_devices: number
          revoked: boolean
          token: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          manual_resets_max?: number
          manual_resets_used?: number
          max_devices?: number
          revoked?: boolean
          token: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          manual_resets_max?: number
          manual_resets_used?: number
          max_devices?: number
          revoked?: boolean
          token?: string
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          attempted_at: string
          id: string
          identifier: string
          success: boolean
        }
        Insert: {
          attempted_at?: string
          id?: string
          identifier: string
          success?: boolean
        }
        Update: {
          attempted_at?: string
          id?: string
          identifier?: string
          success?: boolean
        }
        Relationships: []
      }
      master_passwords: {
        Row: {
          created_at: string
          id: string
          month: string
          password: string
          paused: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          month: string
          password: string
          paused?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          month?: string
          password?: string
          paused?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      members: {
        Row: {
          created_at: string
          id: string
          name: string
          photo_url: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          photo_url?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          photo_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      membership_orders: {
        Row: {
          amount: number
          coin_amount: number
          created_at: string
          email: string
          id: string
          kind: string
          membership_token_id: string | null
          package_id: string
          paid_at: string | null
          pakasir_order_id: string | null
          pakasir_qr_url: string
          phone: string
          reserved_until: string
          status: string
          updated_at: string
          user_id: string | null
          wa_attempts: number
          wa_last_attempt_at: string | null
          wa_last_error: string | null
          wa_sent_at: string | null
        }
        Insert: {
          amount?: number
          coin_amount?: number
          created_at?: string
          email: string
          id?: string
          kind?: string
          membership_token_id?: string | null
          package_id: string
          paid_at?: string | null
          pakasir_order_id?: string | null
          pakasir_qr_url?: string
          phone: string
          reserved_until?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          wa_attempts?: number
          wa_last_attempt_at?: string | null
          wa_last_error?: string | null
          wa_sent_at?: string | null
        }
        Update: {
          amount?: number
          coin_amount?: number
          created_at?: string
          email?: string
          id?: string
          kind?: string
          membership_token_id?: string | null
          package_id?: string
          paid_at?: string | null
          pakasir_order_id?: string | null
          pakasir_qr_url?: string
          phone?: string
          reserved_until?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          wa_attempts?: number
          wa_last_attempt_at?: string | null
          wa_last_error?: string | null
          wa_sent_at?: string | null
        }
        Relationships: []
      }
      membership_packages: {
        Row: {
          created_at: string
          description: string
          duration_days: number
          fixed_expires_at: string | null
          fixed_starts_at: string | null
          group_link: string
          id: string
          includes_replays: boolean
          max_devices: number
          name: string
          pakasir_amount: number
          pause_message: string
          paused: boolean
          price_coins: number
          price_idr: number
          quota_reserved: number
          quota_total: number
          replay_info: string
          show_to_reseller: boolean
          show_to_user: boolean
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          duration_days?: number
          fixed_expires_at?: string | null
          fixed_starts_at?: string | null
          group_link?: string
          id?: string
          includes_replays?: boolean
          max_devices?: number
          name: string
          pakasir_amount?: number
          pause_message?: string
          paused?: boolean
          price_coins?: number
          price_idr?: number
          quota_reserved?: number
          quota_total?: number
          replay_info?: string
          show_to_reseller?: boolean
          show_to_user?: boolean
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          duration_days?: number
          fixed_expires_at?: string | null
          fixed_starts_at?: string | null
          group_link?: string
          id?: string
          includes_replays?: boolean
          max_devices?: number
          name?: string
          pakasir_amount?: number
          pause_message?: string
          paused?: boolean
          price_coins?: number
          price_idr?: number
          quota_reserved?: number
          quota_total?: number
          replay_info?: string
          show_to_reseller?: boolean
          show_to_user?: boolean
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      membership_payment_proofs: {
        Row: {
          amount: number
          created_at: string
          email: string
          expires_at: string
          handled: boolean
          id: string
          image_path: string
          note: string
          order_id: string | null
          package_name: string
          phone: string
          review_status: string
          show_order_id: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          email?: string
          expires_at?: string
          handled?: boolean
          id?: string
          image_path: string
          note?: string
          order_id?: string | null
          package_name?: string
          phone?: string
          review_status?: string
          show_order_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          email?: string
          expires_at?: string
          handled?: boolean
          id?: string
          image_path?: string
          note?: string
          order_id?: string | null
          package_name?: string
          phone?: string
          review_status?: string
          show_order_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "membership_payment_proofs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "membership_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_payment_proofs_show_order_id_fkey"
            columns: ["show_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_replay_passwords: {
        Row: {
          created_at: string
          id: string
          membership_expires_at: string
          password: string
          starts_at: string
          token: string
          valid_until: string
        }
        Insert: {
          created_at?: string
          id?: string
          membership_expires_at: string
          password: string
          starts_at: string
          token?: string
          valid_until: string
        }
        Update: {
          created_at?: string
          id?: string
          membership_expires_at?: string
          password?: string
          starts_at?: string
          token?: string
          valid_until?: string
        }
        Relationships: []
      }
      membership_token_devices: {
        Row: {
          browser_id: string
          created_at: string
          id: string
          last_seen: string
          token_id: string
        }
        Insert: {
          browser_id: string
          created_at?: string
          id?: string
          last_seen?: string
          token_id: string
        }
        Update: {
          browser_id?: string
          created_at?: string
          id?: string
          last_seen?: string
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_token_devices_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "membership_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_token_passwords: {
        Row: {
          created_at: string
          id: string
          password: string
          token_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          password: string
          token_id: string
        }
        Update: {
          created_at?: string
          id?: string
          password?: string
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_token_passwords_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "membership_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_tokens: {
        Row: {
          created_at: string
          created_by: string
          duration_days: number
          expires_at: string
          group_link_override: string | null
          id: string
          includes_replays: boolean
          label: string
          manual_resets_day: string | null
          manual_resets_max: number
          manual_resets_used: number
          max_devices: number
          package_id: string | null
          password: string
          password_rotating: boolean
          phone: string
          replay_info: string
          revoked: boolean
          starts_at: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          duration_days?: number
          expires_at: string
          group_link_override?: string | null
          id?: string
          includes_replays?: boolean
          label?: string
          manual_resets_day?: string | null
          manual_resets_max?: number
          manual_resets_used?: number
          max_devices?: number
          package_id?: string | null
          password?: string
          password_rotating?: boolean
          phone?: string
          replay_info?: string
          revoked?: boolean
          starts_at?: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          duration_days?: number
          expires_at?: string
          group_link_override?: string | null
          id?: string
          includes_replays?: boolean
          label?: string
          manual_resets_day?: string | null
          manual_resets_max?: number
          manual_resets_used?: number
          max_devices?: number
          package_id?: string | null
          password?: string
          password_rotating?: boolean
          phone?: string
          replay_info?: string
          revoked?: boolean
          starts_at?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_token_devices: {
        Row: {
          browser_id: string
          created_at: string
          id: string
          order_id: string
        }
        Insert: {
          browser_id: string
          created_at?: string
          id?: string
          order_id: string
        }
        Update: {
          browser_id?: string
          created_at?: string
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_token_devices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          access_token: string | null
          amount: number
          coin_amount: number
          coin_package_id: string | null
          created_at: string
          id: string
          item_title: string
          kind: string
          manual_resets_max: number
          manual_resets_used: number
          paid_at: string | null
          pakasir_order_id: string | null
          pakasir_qr_url: string
          replay_id: string | null
          show_id: string | null
          status: string
          token_sent_at: string | null
          updated_at: string
          user_id: string | null
          user_phone: string
        }
        Insert: {
          access_token?: string | null
          amount?: number
          coin_amount?: number
          coin_package_id?: string | null
          created_at?: string
          id?: string
          item_title?: string
          kind?: string
          manual_resets_max?: number
          manual_resets_used?: number
          paid_at?: string | null
          pakasir_order_id?: string | null
          pakasir_qr_url?: string
          replay_id?: string | null
          show_id?: string | null
          status?: string
          token_sent_at?: string | null
          updated_at?: string
          user_id?: string | null
          user_phone: string
        }
        Update: {
          access_token?: string | null
          amount?: number
          coin_amount?: number
          coin_package_id?: string | null
          created_at?: string
          id?: string
          item_title?: string
          kind?: string
          manual_resets_max?: number
          manual_resets_used?: number
          paid_at?: string | null
          pakasir_order_id?: string | null
          pakasir_qr_url?: string
          replay_id?: string | null
          show_id?: string | null
          status?: string
          token_sent_at?: string | null
          updated_at?: string
          user_id?: string | null
          user_phone?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      rate_limit_violations: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          ip: unknown
          violation_count: number
        }
        Insert: {
          created_at?: string
          endpoint?: string
          id?: string
          ip: unknown
          violation_count?: number
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          ip?: unknown
          violation_count?: number
        }
        Relationships: []
      }
      ratings: {
        Row: {
          browser_id: string
          created_at: string
          id: string
          rating: number
          replay_id: string
        }
        Insert: {
          browser_id: string
          created_at?: string
          id?: string
          rating: number
          replay_id: string
        }
        Update: {
          browser_id?: string
          created_at?: string
          id?: string
          rating?: number
          replay_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_replay_id_fkey"
            columns: ["replay_id"]
            isOneToOne: false
            referencedRelation: "replays"
            referencedColumns: ["id"]
          },
        ]
      }
      replay_personal_tokens: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          label: string
          manual_resets_max: number
          manual_resets_used: number
          max_devices: number
          replay_id: string
          revoked: boolean
          token: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          label?: string
          manual_resets_max?: number
          manual_resets_used?: number
          max_devices?: number
          replay_id: string
          revoked?: boolean
          token: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          label?: string
          manual_resets_max?: number
          manual_resets_used?: number
          max_devices?: number
          replay_id?: string
          revoked?: boolean
          token?: string
        }
        Relationships: []
      }
      replay_token_devices: {
        Row: {
          browser_id: string
          created_at: string
          id: string
          token_id: string
        }
        Insert: {
          browser_id: string
          created_at?: string
          id?: string
          token_id: string
        }
        Update: {
          browser_id?: string
          created_at?: string
          id?: string
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "replay_token_devices_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "replay_personal_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      replays: {
        Row: {
          access_token: string | null
          admin_alias: string
          created_at: string
          criteria: string
          date: string
          featured_member: string
          id: string
          image_fit: string
          image_url: string
          is_offline: boolean
          lineup: string[]
          m3u8_url: string
          offline_at: string | null
          offline_reason: string
          password: string
          price_coins: number
          price_idr: number
          short_title: string
          show_name: string
          show_time: string | null
          source_type: string
          sources: Json
          title: string
          updated_at: string
          view_count: number
          youtube_alt_id: string
          youtube_id: string
        }
        Insert: {
          access_token?: string | null
          admin_alias?: string
          created_at?: string
          criteria?: string
          date: string
          featured_member?: string
          id?: string
          image_fit?: string
          image_url?: string
          is_offline?: boolean
          lineup?: string[]
          m3u8_url?: string
          offline_at?: string | null
          offline_reason?: string
          password: string
          price_coins?: number
          price_idr?: number
          short_title?: string
          show_name?: string
          show_time?: string | null
          source_type?: string
          sources?: Json
          title: string
          updated_at?: string
          view_count?: number
          youtube_alt_id?: string
          youtube_id?: string
        }
        Update: {
          access_token?: string | null
          admin_alias?: string
          created_at?: string
          criteria?: string
          date?: string
          featured_member?: string
          id?: string
          image_fit?: string
          image_url?: string
          is_offline?: boolean
          lineup?: string[]
          m3u8_url?: string
          offline_at?: string | null
          offline_reason?: string
          password?: string
          price_coins?: number
          price_idr?: number
          short_title?: string
          show_name?: string
          show_time?: string | null
          source_type?: string
          sources?: Json
          title?: string
          updated_at?: string
          view_count?: number
          youtube_alt_id?: string
          youtube_id?: string
        }
        Relationships: []
      }
      reseller_audit_log: {
        Row: {
          created_at: string
          duration_days: number | null
          expires_at: string | null
          id: string
          kind: string
          meta: Json
          reseller_label: string
          reseller_phone: string
          target_id: string | null
          target_title: string
          token: string
        }
        Insert: {
          created_at?: string
          duration_days?: number | null
          expires_at?: string | null
          id?: string
          kind: string
          meta?: Json
          reseller_label?: string
          reseller_phone: string
          target_id?: string | null
          target_title?: string
          token?: string
        }
        Update: {
          created_at?: string
          duration_days?: number | null
          expires_at?: string | null
          id?: string
          kind?: string
          meta?: Json
          reseller_label?: string
          reseller_phone?: string
          target_id?: string | null
          target_title?: string
          token?: string
        }
        Relationships: []
      }
      reseller_bills: {
        Row: {
          amount: number
          breakdown: Json
          computed_amount: number
          created_at: string
          id: string
          paid_at: string | null
          pakasir_order_id: string | null
          pakasir_qr_url: string
          reseller_label: string
          reseller_phone: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          breakdown?: Json
          computed_amount?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          pakasir_order_id?: string | null
          pakasir_qr_url?: string
          reseller_label?: string
          reseller_phone: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          breakdown?: Json
          computed_amount?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          pakasir_order_id?: string | null
          pakasir_qr_url?: string
          reseller_label?: string
          reseller_phone?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      reseller_copy_log: {
        Row: {
          created_at: string
          id: string
          kind: string
          reseller_label: string
          reseller_phone: string
          target_id: string | null
          target_title: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          reseller_label?: string
          reseller_phone: string
          target_id?: string | null
          target_title?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          reseller_label?: string
          reseller_phone?: string
          target_id?: string | null
          target_title?: string
        }
        Relationships: []
      }
      reseller_show_prices: {
        Row: {
          price_per_link: number
          show_id: string
          updated_at: string
        }
        Insert: {
          price_per_link?: number
          show_id: string
          updated_at?: string
        }
        Update: {
          price_per_link?: number
          show_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      show_bundle_items: {
        Row: {
          bundle_id: string
          created_at: string
          excluded: boolean
          id: string
          show_id: string
          updated_at: string
        }
        Insert: {
          bundle_id: string
          created_at?: string
          excluded?: boolean
          id?: string
          show_id: string
          updated_at?: string
        }
        Update: {
          bundle_id?: string
          created_at?: string
          excluded?: boolean
          id?: string
          show_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "show_bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "show_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_bundle_items_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "active_shows"
            referencedColumns: ["id"]
          },
        ]
      }
      show_bundle_passwords: {
        Row: {
          bundle_id: string
          created_at: string
          id: string
          is_current: boolean
          password: string
        }
        Insert: {
          bundle_id: string
          created_at?: string
          id?: string
          is_current?: boolean
          password: string
        }
        Update: {
          bundle_id?: string
          created_at?: string
          id?: string
          is_current?: boolean
          password?: string
        }
        Relationships: [
          {
            foreignKeyName: "show_bundle_passwords_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "show_bundles"
            referencedColumns: ["id"]
          },
        ]
      }
      show_bundle_tokens: {
        Row: {
          bundle_id: string
          created_at: string
          expires_at: string | null
          id: string
          label: string
          max_devices: number
          order_id: string | null
          password: string
          phone: string
          revoked: boolean
          show_ids: string[]
          token: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bundle_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          label?: string
          max_devices?: number
          order_id?: string | null
          password?: string
          phone?: string
          revoked?: boolean
          show_ids?: string[]
          token: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bundle_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          label?: string
          max_devices?: number
          order_id?: string | null
          password?: string
          phone?: string
          revoked?: boolean
          show_ids?: string[]
          token?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "show_bundle_tokens_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "show_bundles"
            referencedColumns: ["id"]
          },
        ]
      }
      show_bundles: {
        Row: {
          created_at: string
          description: string
          discount_coins: number
          discount_idr: number
          id: string
          is_active: boolean
          name: string
          price_coins: number
          price_idr: number
          promo_label: string
          show_count: number
          theme: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          discount_coins?: number
          discount_idr?: number
          id?: string
          is_active?: boolean
          name?: string
          price_coins?: number
          price_idr?: number
          promo_label?: string
          show_count?: number
          theme?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          discount_coins?: number
          discount_idr?: number
          id?: string
          is_active?: boolean
          name?: string
          price_coins?: number
          price_idr?: number
          promo_label?: string
          show_count?: number
          theme?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      telegram_links: {
        Row: {
          chat_id: number | null
          created_at: string
          id: string
          link_code: string
          linked_at: string | null
          phone: string
          user_id: string | null
        }
        Insert: {
          chat_id?: number | null
          created_at?: string
          id?: string
          link_code: string
          linked_at?: string | null
          phone: string
          user_id?: string | null
        }
        Update: {
          chat_id?: number | null
          created_at?: string
          id?: string
          link_code?: string
          linked_at?: string | null
          phone?: string
          user_id?: string | null
        }
        Relationships: []
      }
      token_deliveries: {
        Row: {
          access_token: string
          id: string
          link: string
          order_id: string | null
          phone: string
          replay_id: string | null
          replay_title: string
          requested_by: string
          sent_at: string
          source: string
        }
        Insert: {
          access_token: string
          id?: string
          link?: string
          order_id?: string | null
          phone: string
          replay_id?: string | null
          replay_title?: string
          requested_by?: string
          sent_at?: string
          source?: string
        }
        Update: {
          access_token?: string
          id?: string
          link?: string
          order_id?: string | null
          phone?: string
          replay_id?: string | null
          replay_title?: string
          requested_by?: string
          sent_at?: string
          source?: string
        }
        Relationships: []
      }
      token_factory_history: {
        Row: {
          created_at: string
          email: string
          expires_at: string | null
          id: string
          kind: string
          label: string
          order_id: string | null
          original_link: string
          phone: string
          restored_at: string
          show_id: string | null
          source: string
          title: string
          token: string
          user_id: string | null
          username: string
        }
        Insert: {
          created_at: string
          email?: string
          expires_at?: string | null
          id?: string
          kind: string
          label?: string
          order_id?: string | null
          original_link?: string
          phone?: string
          restored_at?: string
          show_id?: string | null
          source?: string
          title?: string
          token: string
          user_id?: string | null
          username?: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string | null
          id?: string
          kind?: string
          label?: string
          order_id?: string | null
          original_link?: string
          phone?: string
          restored_at?: string
          show_id?: string | null
          source?: string
          title?: string
          token?: string
          user_id?: string | null
          username?: string
        }
        Relationships: []
      }
      tv_pair_codes: {
        Row: {
          browser_id: string | null
          code: string
          created_at: string
          expires_at: string
          payload: Json
          show_id: string | null
          used_at: string | null
        }
        Insert: {
          browser_id?: string | null
          code: string
          created_at?: string
          expires_at: string
          payload: Json
          show_id?: string | null
          used_at?: string | null
        }
        Update: {
          browser_id?: string | null
          code?: string
          created_at?: string
          expires_at?: string
          payload?: Json
          show_id?: string | null
          used_at?: string | null
        }
        Relationships: []
      }
      tv_sessions: {
        Row: {
          browser_id: string | null
          claims: Json
          created_at: string
          expires_at: string
          id: string
          payload: Json
          revoked: boolean
          session_token: string
          show_id: string | null
        }
        Insert: {
          browser_id?: string | null
          claims?: Json
          created_at?: string
          expires_at?: string
          id?: string
          payload?: Json
          revoked?: boolean
          session_token: string
          show_id?: string | null
        }
        Update: {
          browser_id?: string | null
          claims?: Json
          created_at?: string
          expires_at?: string
          id?: string
          payload?: Json
          revoked?: boolean
          session_token?: string
          show_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wa_outbox: {
        Row: {
          created_at: string
          error: string | null
          fonnte_response: Json | null
          id: string
          message: string
          phone: string
          related_order_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          fonnte_response?: Json | null
          id?: string
          message: string
          phone: string
          related_order_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          fonnte_response?: Json | null
          id?: string
          message?: string
          phone?: string
          related_order_id?: string | null
          status?: string
        }
        Relationships: []
      }
      wa_send_claims: {
        Row: {
          claimed_at: string
          dedup_key: string
          sent: boolean
        }
        Insert: {
          claimed_at?: string
          dedup_key: string
          sent?: boolean
        }
        Update: {
          claimed_at?: string
          dedup_key?: string
          sent?: boolean
        }
        Relationships: []
      }
      yearly_passwords: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          label: string
          password: string
          paused: boolean
          starts_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          label?: string
          password: string
          paused?: boolean
          starts_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          label?: string
          password?: string
          paused?: boolean
          starts_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_block_ip: {
        Args: { _ip: unknown; _reason: string }
        Returns: string
      }
      admin_block_token: {
        Args: { _kind: string; _token_id: string }
        Returns: number
      }
      admin_block_user: {
        Args: { _phone: string; _reason: string; _user_id: string }
        Returns: undefined
      }
      admin_bulk_delete_expired_tokens: {
        Args: { _ids?: string[]; _kind: string }
        Returns: number
      }
      admin_bulk_reset_devices: { Args: { _kind: string }; Returns: Json }
      admin_clear_live_messages: { Args: never; Returns: number }
      admin_clear_reseller_copy_log: {
        Args: { _phone?: string }
        Returns: number
      }
      admin_create_membership_user: {
        Args: {
          _days: number
          _email: string
          _includes_replays?: boolean
          _max_devices?: number
          _package_id: string
          _phone: string
          _replay_info?: string
        }
        Returns: Json
      }
      admin_delete_membership_proof: { Args: { _id: string }; Returns: string }
      admin_delete_membership_user: {
        Args: { _order_id: string }
        Returns: undefined
      }
      admin_delete_reseller_copy_entry: {
        Args: { _kind: string; _phone: string; _target_id: string }
        Returns: Json
      }
      admin_delete_token: {
        Args: { _kind: string; _token_id: string }
        Returns: undefined
      }
      admin_delete_wa_outbox_for_orders: {
        Args: { _order_ids: string[] }
        Returns: number
      }
      admin_delete_wa_outbox_for_show: {
        Args: { _show_id: string }
        Returns: number
      }
      admin_exhaust_reseller_tokens: {
        Args: { _phone: string }
        Returns: number
      }
      admin_export_auth_users: {
        Args: { _admin_id: string }
        Returns: {
          created_at: string
          email: string
          email_confirmed_at: string
          encrypted_password: string
          id: string
          is_sso_user: boolean
          last_sign_in_at: string
          phone: string
          phone_confirmed_at: string
          raw_app_meta_data: Json
          raw_user_meta_data: Json
          updated_at: string
        }[]
      }
      admin_get_active_show: {
        Args: { _id: string }
        Returns: {
          admin_alias: string | null
          category: string
          created_at: string
          description: string
          featured_member: string
          group_link: string
          group_link_enabled: boolean
          group_link_label: string
          group_link_note: string
          id: string
          idn_show_id: string
          image_url: string
          is_active: boolean
          is_live: boolean
          is_special: boolean
          lineup: string[]
          live_auto_schedule: boolean
          live_hold_until: string | null
          live_password: string
          live_require_password: boolean
          live_sources: Json
          live_type: string
          live_url: string
          pakasir_amount: number
          price_replay: number
          price_replay_coins: number
          price_show: number
          price_show_coins: number
          replay_enabled: boolean
          replay_id: string | null
          replay_info: string
          replay_m3u8_url: string
          replay_mode: boolean
          replay_youtube_url: string
          server2_url: string
          server3_url: string
          short_title: string
          show_date: string
          show_time: string
          sort_order: number
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "active_shows"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_get_active_shows: {
        Args: never
        Returns: {
          admin_alias: string | null
          category: string
          created_at: string
          description: string
          featured_member: string
          group_link: string
          group_link_enabled: boolean
          group_link_label: string
          group_link_note: string
          id: string
          idn_show_id: string
          image_url: string
          is_active: boolean
          is_live: boolean
          is_special: boolean
          lineup: string[]
          live_auto_schedule: boolean
          live_hold_until: string | null
          live_password: string
          live_require_password: boolean
          live_sources: Json
          live_type: string
          live_url: string
          pakasir_amount: number
          price_replay: number
          price_replay_coins: number
          price_show: number
          price_show_coins: number
          replay_enabled: boolean
          replay_id: string | null
          replay_info: string
          replay_m3u8_url: string
          replay_mode: boolean
          replay_youtube_url: string
          server2_url: string
          server3_url: string
          short_title: string
          show_date: string
          show_time: string
          sort_order: number
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "active_shows"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_get_chat_sender: { Args: { _message_id: string }; Returns: Json }
      admin_get_membership_packages: {
        Args: never
        Returns: {
          created_at: string
          description: string
          duration_days: number
          fixed_expires_at: string | null
          fixed_starts_at: string | null
          group_link: string
          id: string
          includes_replays: boolean
          max_devices: number
          name: string
          pakasir_amount: number
          pause_message: string
          paused: boolean
          price_coins: number
          price_idr: number
          quota_reserved: number
          quota_total: number
          replay_info: string
          show_to_reseller: boolean
          show_to_user: boolean
          sort_order: number
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "membership_packages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_get_replays: {
        Args: never
        Returns: {
          access_token: string | null
          admin_alias: string
          created_at: string
          criteria: string
          date: string
          featured_member: string
          id: string
          image_fit: string
          image_url: string
          is_offline: boolean
          lineup: string[]
          m3u8_url: string
          offline_at: string | null
          offline_reason: string
          password: string
          price_coins: number
          price_idr: number
          short_title: string
          show_name: string
          show_time: string | null
          source_type: string
          sources: Json
          title: string
          updated_at: string
          view_count: number
          youtube_alt_id: string
          youtube_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "replays"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_get_show_bundle: { Args: never; Returns: Json }
      admin_list_blocked_ips: {
        Args: never
        Returns: {
          auto_blocked: boolean
          blocked_at: string
          created_at: string
          created_by: string | null
          id: string
          ip: unknown
          is_active: boolean
          reason: string
          unblocked_at: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "blocked_ips"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_ip_violations: {
        Args: { _limit?: number }
        Returns: {
          created_at: string
          endpoint: string
          id: string
          ip: unknown
          violation_count: number
        }[]
        SetofOptions: {
          from: "*"
          to: "rate_limit_violations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_ip_visits: {
        Args: { _limit?: number }
        Returns: {
          endpoint: string
          first_seen_at: string
          id: string
          ip: unknown
          last_seen_at: string
          path: string
          user_agent: string
          visit_count: number
        }[]
        SetofOptions: {
          from: "*"
          to: "ip_visit_log"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_membership_proofs: {
        Args: never
        Returns: {
          amount: number
          created_at: string
          email: string
          expires_at: string
          handled: boolean
          id: string
          image_path: string
          note: string
          order_id: string | null
          package_name: string
          phone: string
          review_status: string
          show_order_id: string | null
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "membership_payment_proofs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_membership_tokens: {
        Args: { _q?: string; _status?: string }
        Returns: {
          created_at: string
          created_by: string
          devices_used: number
          duration_days: number
          expires_at: string
          id: string
          includes_replays: boolean
          label: string
          max_devices: number
          package_id: string
          package_name: string
          password: string
          phone: string
          revoked: boolean
          starts_at: string
          status: string
          token: string
        }[]
      }
      admin_list_membership_users: {
        Args: { _q?: string; _status?: string }
        Returns: {
          amount: number
          coin_amount: number
          created_at: string
          days_remaining: number
          devices_used: number
          duration_days: number
          email: string
          expires_at: string
          includes_replays: boolean
          kind: string
          max_devices: number
          order_id: string
          package_id: string
          package_name: string
          paid_at: string
          password: string
          phone: string
          revoked: boolean
          starts_at: string
          status: string
          token: string
          token_id: string
          user_id: string
        }[]
      }
      admin_list_moderators: {
        Args: never
        Returns: {
          email: string
          user_id: string
          username: string
        }[]
      }
      admin_list_show_tokens: {
        Args: { _q?: string; _status?: string }
        Returns: {
          created_at: string
          devices_used: number
          expires_at: string
          id: string
          kind: string
          label: string
          max_devices: number
          revoked: boolean
          show_date: string
          show_id: string
          show_title: string
          single_use: boolean
          status: string
          token: string
        }[]
      }
      admin_override_reseller_bill: {
        Args: { _amount: number; _bill_id: string }
        Returns: undefined
      }
      admin_reseller_billing_summary: {
        Args: never
        Returns: {
          has_pending: boolean
          pending_amount: number
          pending_bill_id: string
          reseller_label: string
          reseller_phone: string
          total_amount: number
          total_links: number
        }[]
      }
      admin_reseller_copy_stats: {
        Args: never
        Returns: {
          copies: number
          kind: string
          last_copied: string
          reseller_label: string
          reseller_phone: string
          target_id: string
          target_title: string
        }[]
      }
      admin_reset_reseller_audit_token_devices: {
        Args: { _audit_id: string }
        Returns: number
      }
      admin_reset_reseller_token_devices: {
        Args: { _phone?: string }
        Returns: number
      }
      admin_reset_token_devices: {
        Args: { _kind: string; _token_id: string }
        Returns: number
      }
      admin_restore_replay_source: {
        Args: {
          _m3u8_url?: string
          _replay_id: string
          _source_type: string
          _youtube_id?: string
        }
        Returns: undefined
      }
      admin_revoke_reseller_token: {
        Args: { _audit_id: string }
        Returns: boolean
      }
      admin_rotate_bundle_password: { Args: never; Returns: string }
      admin_search_users_by_phone: {
        Args: { _q: string }
        Returns: {
          block_reason: string
          blocked: boolean
          created_at: string
          email: string
          phone: string
          user_id: string
          username: string
        }[]
      }
      admin_set_bundle_active: {
        Args: { _active: boolean }
        Returns: undefined
      }
      admin_set_bundle_show: {
        Args: { _excluded: boolean; _show_id: string }
        Returns: undefined
      }
      admin_set_moderator: {
        Args: { _on: boolean; _user_id: string }
        Returns: boolean
      }
      admin_set_proof_handled: {
        Args: { _handled: boolean; _id: string }
        Returns: undefined
      }
      admin_set_replay_offline: {
        Args: { _offline: boolean; _reason?: string; _replay_id: string }
        Returns: undefined
      }
      admin_set_reseller_copy_count: {
        Args: {
          _count: number
          _kind: string
          _phone: string
          _target_id: string
        }
        Returns: number
      }
      admin_sync_package_duration: {
        Args: { _include_expired?: boolean; _package_id: string }
        Returns: number
      }
      admin_token_factory_owners: { Args: { _ids: string[] }; Returns: Json }
      admin_unblock_ip: { Args: { _id: string }; Returns: boolean }
      admin_unblock_token: {
        Args: { _kind: string; _token_id: string }
        Returns: number
      }
      admin_unblock_user: { Args: { _id: string }; Returns: undefined }
      admin_update_bundle_style: {
        Args: {
          _description?: string
          _discount_coins?: number
          _discount_idr?: number
          _name?: string
          _promo_label?: string
          _theme?: string
        }
        Returns: undefined
      }
      admin_update_membership_user: {
        Args: {
          _email: string
          _expires_at: string
          _includes_replays: boolean
          _max_devices: number
          _order_id: string
          _phone: string
          _revoked: boolean
        }
        Returns: undefined
      }
      am_i_blocked: { Args: never; Returns: boolean }
      auto_live_sync: { Args: never; Returns: undefined }
      bundle_expiry_for_shows: { Args: { _ids: string[] }; Returns: string }
      check_login_lock: {
        Args: { _identifier: string }
        Returns: {
          fail_count: number
          locked: boolean
          seconds_remaining: number
        }[]
      }
      claim_wa_send: {
        Args: { _key: string; _retry_seconds?: number }
        Returns: boolean
      }
      cleanup_expired_membership_proofs: {
        Args: never
        Returns: {
          deleted_path: string
        }[]
      }
      convert_show_to_replay: { Args: { _show_id: string }; Returns: string }
      credit_coin_topup_order: {
        Args: { _order_id: string }
        Returns: {
          already_credited: boolean
          new_balance: number
        }[]
      }
      cron_clear_live_messages: { Args: never; Returns: undefined }
      debit_coins_for_purchase: {
        Args: {
          _meta?: Json
          _price: number
          _reason: string
          _replay_id: string
          _show_id: string
          _user_id: string
        }
        Returns: number
      }
      email_for_identifier: { Args: { _identifier: string }; Returns: string }
      email_for_phone: { Args: { _phone: string }; Returns: string }
      expire_membership_reservations: { Args: never; Returns: number }
      finalize_membership_order: {
        Args: { _order_id: string }
        Returns: {
          duration_days: number
          expires_at: string
          includes_replays: boolean
          max_devices: number
          package_name: string
          password: string
          replay_info: string
          token: string
        }[]
      }
      gen_bundle_password: { Args: never; Returns: string }
      gen_short_password: { Args: never; Returns: string }
      get_active_live: {
        Args: never
        Returns: {
          category: string
          id: string
          image_url: string
          is_live: boolean
          lineup: string[]
          live_auto_schedule: boolean
          live_require_password: boolean
          live_sources: Json
          live_type: string
          replay_mode: boolean
          show_date: string
          show_time: string
          title: string
        }[]
      }
      get_live_status: {
        Args: never
        Returns: {
          enabled: boolean
          lineup: string[]
          require_password: boolean
          sources: Json
          title: string
          type: string
        }[]
      }
      get_my_memberships: {
        Args: never
        Returns: {
          amount: number
          coin_amount: number
          created_at: string
          days_remaining: number
          duration_days: number
          email: string
          expires_at: string
          includes_replays: boolean
          kind: string
          max_devices: number
          order_id: string
          package_id: string
          package_name: string
          package_paused: boolean
          paid_at: string
          pakasir_qr_url: string
          password: string
          pause_message: string
          phone: string
          reserved_until: string
          revoked: boolean
          starts_at: string
          status: string
          token: string
        }[]
      }
      get_show_bundle: {
        Args: never
        Returns: {
          description: string
          discount_coins: number
          discount_idr: number
          id: string
          is_active: boolean
          name: string
          price_coins: number
          price_idr: number
          promo_label: string
          show_count: number
          show_ids: string[]
          theme: string
        }[]
      }
      grant_coins: {
        Args: {
          _delta: number
          _meta?: Json
          _order_id?: string
          _reason: string
          _user_id: string
        }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_view_count: { Args: { _replay_id: string }; Returns: number }
      is_ip_blocked: { Args: { _ip: unknown }; Returns: boolean }
      mark_reseller_bill_paid: {
        Args: { _bill_id: string }
        Returns: undefined
      }
      mark_wa_sent: { Args: { _key: string }; Returns: undefined }
      mod_block_chat: {
        Args: { _browser_id: string; _name: string; _reason?: string }
        Returns: boolean
      }
      mod_delete_message: { Args: { _message_id: string }; Returns: boolean }
      mod_unblock_chat: { Args: { _browser_id: string }; Returns: boolean }
      norm_phone: { Args: { _p: string }; Returns: string }
      phone_exists: { Args: { _phone: string }; Returns: boolean }
      prune_old_logs: { Args: never; Returns: undefined }
      prune_proofs_and_storage: { Args: never; Returns: number }
      purge_expired_membership_tokens: { Args: never; Returns: number }
      rate_replay: {
        Args: { _browser_id: string; _rating: number; _replay_id: string }
        Returns: undefined
      }
      record_ip_visit: {
        Args: {
          _endpoint: string
          _ip: unknown
          _max_per_min?: number
          _path: string
          _user_agent: string
        }
        Returns: {
          blocked: boolean
          reason: string
        }[]
      }
      record_login_attempt: {
        Args: { _identifier: string; _success: boolean }
        Returns: undefined
      }
      release_membership_slot: {
        Args: { _order_id: string; _reason: string }
        Returns: boolean
      }
      reseller_block_token: {
        Args: { _audit_id: string; _phone: string; _pin: string }
        Returns: number
      }
      reseller_compute_bill: {
        Args: { _phone: string; _pin: string }
        Returns: {
          copies: number
          kind: string
          price_per_link: number
          subtotal: number
          target_id: string
          target_title: string
          total: number
        }[]
      }
      reseller_copy_stats: {
        Args: { _phone: string; _pin: string }
        Returns: {
          copies: number
          kind: string
          last_copied: string
          target_id: string
          target_title: string
        }[]
      }
      reseller_create_bill_intent: {
        Args: { _phone: string; _pin: string }
        Returns: {
          amount: number
          bill_id: string
          breakdown: Json
        }[]
      }
      reseller_delete_token: {
        Args: { _audit_id: string; _phone: string; _pin: string }
        Returns: boolean
      }
      reseller_get_active_bill: {
        Args: { _phone: string; _pin: string }
        Returns: {
          amount: number
          breakdown: Json
          computed_amount: number
          created_at: string
          id: string
          paid_at: string
          pakasir_order_id: string
          pakasir_qr_url: string
          status: string
        }[]
      }
      reseller_list_membership_packages: {
        Args: { _phone: string; _pin: string }
        Returns: {
          description: string
          duration_days: number
          id: string
          includes_replays: boolean
          max_devices: number
          name: string
          paused: boolean
          replay_info: string
          status: string
        }[]
      }
      reseller_list_replays: {
        Args: {
          _limit: number
          _offset: number
          _phone: string
          _pin: string
          _q: string
        }
        Returns: {
          date: string
          id: string
          image_url: string
          show_name: string
          title: string
        }[]
      }
      reseller_list_shows: {
        Args: { _phone: string; _pin: string }
        Returns: {
          category: string
          id: string
          image_url: string
          is_active: boolean
          is_live: boolean
          show_date: string
          show_time: string
          title: string
        }[]
      }
      reseller_list_tokens: {
        Args: {
          _limit?: number
          _offset?: number
          _phone: string
          _pin: string
          _q?: string
        }
        Returns: {
          audit_id: string
          created_at: string
          device_count: number
          expires_at: string
          kind: string
          revoked: boolean
          target_id: string
          target_title: string
          token: string
        }[]
      }
      reseller_log_copy: {
        Args: {
          _kind: string
          _phone: string
          _pin: string
          _target_id: string
          _target_title: string
        }
        Returns: undefined
      }
      reseller_login: {
        Args: { _phone: string; _pin: string }
        Returns: {
          label: string
          ok: boolean
          phone: string
        }[]
      }
      reseller_reset_token_devices: {
        Args: { _audit_id: string; _phone: string; _pin: string }
        Returns: number
      }
      reseller_revoke_token: {
        Args: { _audit_id: string; _phone: string; _pin: string }
        Returns: boolean
      }
      reseller_unblock_token: {
        Args: { _audit_id: string; _phone: string; _pin: string }
        Returns: number
      }
      reseller_verify: {
        Args: { _phone: string; _pin: string }
        Returns: boolean
      }
      reserve_membership_slot: {
        Args: {
          _email: string
          _kind: string
          _package_id: string
          _phone: string
          _user_id: string
        }
        Returns: {
          amount: number
          coin_amount: number
          order_id: string
          reserved_until: string
        }[]
      }
      rotate_membership_passwords: { Args: never; Returns: number }
      service_send_live_chat: {
        Args: { _message: Json; _sender: Json }
        Returns: Json
      }
      show_start_at: { Args: { _show_id: string }; Returns: string }
      sync_show_bundle: { Args: never; Returns: undefined }
      token_cleanup_at: { Args: { _expires_at: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "user" | "moderator"
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
      app_role: ["admin", "user", "moderator"],
    },
  },
} as const
