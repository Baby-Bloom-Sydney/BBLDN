export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_erasure_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          object_count: number | null
          purged_at: string | null
          refusal_reason: string | null
          requested_at: string
          requested_by: string | null
          road: string
          scrubbed_tables: string[] | null
          state: string
          subject_user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          object_count?: number | null
          purged_at?: string | null
          refusal_reason?: string | null
          requested_at?: string
          requested_by?: string | null
          road: string
          scrubbed_tables?: string[] | null
          state?: string
          subject_user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          object_count?: number | null
          purged_at?: string | null
          refusal_reason?: string | null
          requested_at?: string
          requested_by?: string | null
          road?: string
          scrubbed_tables?: string[] | null
          state?: string
          subject_user_id?: string | null
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          due_at: string | null
          emailed_at: string | null
          emailed_message_id: string | null
          id: string
          kind: Database["public"]["Enums"]["admin_notification_kind"]
          subject_id: string | null
          subject_type: string | null
          summary: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          due_at?: string | null
          emailed_at?: string | null
          emailed_message_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["admin_notification_kind"]
          subject_id?: string | null
          subject_type?: string | null
          summary: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          due_at?: string | null
          emailed_at?: string | null
          emailed_message_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["admin_notification_kind"]
          subject_id?: string | null
          subject_type?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_emailed_message_id_fkey"
            columns: ["emailed_message_id"]
            isOneToOne: false
            referencedRelation: "email_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_memory: {
        Row: {
          bloombot_id: string
          child_id: string | null
          content: string
          created_at: string
          id: string
          is_active: boolean
          priority: Database["public"]["Enums"]["memory_priority"]
          relevant_until: string | null
          scope: Database["public"]["Enums"]["memory_scope"]
          source_message_id: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          bloombot_id: string
          child_id?: string | null
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          priority?: Database["public"]["Enums"]["memory_priority"]
          relevant_until?: string | null
          scope: Database["public"]["Enums"]["memory_scope"]
          source_message_id?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          bloombot_id?: string
          child_id?: string | null
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          priority?: Database["public"]["Enums"]["memory_priority"]
          relevant_until?: string | null
          scope?: Database["public"]["Enums"]["memory_scope"]
          source_message_id?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_memory_bloombot_id_fkey"
            columns: ["bloombot_id"]
            isOneToOne: false
            referencedRelation: "bloombot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_memory_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_memory_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      areas: {
        Row: {
          area: string
          borough: string | null
          district: string
          is_active: boolean
          lat: number
          lon: number
          seeded_at: string
          source: string
        }
        Insert: {
          area: string
          borough?: string | null
          district: string
          is_active?: boolean
          lat: number
          lon: number
          seeded_at?: string
          source: string
        }
        Update: {
          area?: string
          borough?: string | null
          district?: string
          is_active?: boolean
          lat?: number
          lon?: number
          seeded_at?: string
          source?: string
        }
        Relationships: []
      }
      availability_blocks: {
        Row: {
          calendar_id: string
          created_at: string
          created_by: string | null
          end_at: string
          id: string
          kind: Database["public"]["Enums"]["block_kind"]
          reason: string | null
          revoked_at: string | null
          start_at: string
        }
        Insert: {
          calendar_id: string
          created_at?: string
          created_by?: string | null
          end_at: string
          id?: string
          kind: Database["public"]["Enums"]["block_kind"]
          reason?: string | null
          revoked_at?: string | null
          start_at: string
        }
        Update: {
          calendar_id?: string
          created_at?: string
          created_by?: string | null
          end_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["block_kind"]
          reason?: string | null
          revoked_at?: string | null
          start_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_blocks_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_rules: {
        Row: {
          calendar_id: string
          created_at: string
          created_by: string | null
          effective_from: string | null
          effective_to: string | null
          end_time: string
          id: string
          start_time: string
          weekday: number
        }
        Insert: {
          calendar_id: string
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          end_time: string
          id?: string
          start_time: string
          weekday: number
        }
        Update: {
          calendar_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          end_time?: string
          id?: string
          start_time?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "availability_rules_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      biometric_consent_records: {
        Row: {
          ai_provider_disclosed: string
          checkbox_timestamps: Json
          checkboxes_enabled_at: string
          created_at: string
          id: string
          notice_content_hash: string
          notice_document_id: string
          notice_opened_at: string
          notice_scroll_completed_at: string
          notice_time_spent_seconds: number
          notice_version: number
          processing_location_disclosed: string
          user_id: string
        }
        Insert: {
          ai_provider_disclosed: string
          checkbox_timestamps: Json
          checkboxes_enabled_at: string
          created_at?: string
          id?: string
          notice_content_hash: string
          notice_document_id?: string
          notice_opened_at: string
          notice_scroll_completed_at: string
          notice_time_spent_seconds: number
          notice_version: number
          processing_location_disclosed: string
          user_id: string
        }
        Update: {
          ai_provider_disclosed?: string
          checkbox_timestamps?: Json
          checkboxes_enabled_at?: string
          created_at?: string
          id?: string
          notice_content_hash?: string
          notice_document_id?: string
          notice_opened_at?: string
          notice_scroll_completed_at?: string
          notice_time_spent_seconds?: number
          notice_version?: number
          processing_location_disclosed?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "biometric_consent_records_notice_fkey"
            columns: [
              "notice_document_id",
              "notice_version",
              "notice_content_hash",
            ]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["document_id", "version", "content_hash"]
          },
        ]
      }
      bloombot: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["user_role"]
          settings: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          role: Database["public"]["Enums"]["user_role"]
          settings?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          settings?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          attention_reason:
            | Database["public"]["Enums"]["attention_reason"]
            | null
          booked_by_role: Database["public"]["Enums"]["actor_role"]
          booked_by_user_id: string | null
          calendar_id: string
          call_note: string | null
          call_outcome: Database["public"]["Enums"]["call_outcome"] | null
          cancel_reason:
            | Database["public"]["Enums"]["booking_cancel_reason"]
            | null
          created_at: string
          displaced_at: string | null
          displaced_by_booking_id: string | null
          displaced_from_at: string | null
          displacement_count: number
          displacement_count_day: string | null
          done_at: string | null
          done_by: string | null
          end_at: string
          hold_expires_at: string | null
          id: string
          idempotency_key: string | null
          kind: Database["public"]["Enums"]["call_type"]
          needs_attention: boolean
          next_attempt_at: string | null
          notes: string | null
          priority: number
          rescheduled_at: string | null
          rescheduled_from_at: string | null
          start_at: string
          status: Database["public"]["Enums"]["booking_status"]
          subject_id: string
          subject_type: Database["public"]["Enums"]["booking_subject_type"]
          updated_at: string
          version: number
        }
        Insert: {
          attention_reason?:
            | Database["public"]["Enums"]["attention_reason"]
            | null
          booked_by_role: Database["public"]["Enums"]["actor_role"]
          booked_by_user_id?: string | null
          calendar_id: string
          call_note?: string | null
          call_outcome?: Database["public"]["Enums"]["call_outcome"] | null
          cancel_reason?:
            | Database["public"]["Enums"]["booking_cancel_reason"]
            | null
          created_at?: string
          displaced_at?: string | null
          displaced_by_booking_id?: string | null
          displaced_from_at?: string | null
          displacement_count?: number
          displacement_count_day?: string | null
          done_at?: string | null
          done_by?: string | null
          end_at: string
          hold_expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          kind: Database["public"]["Enums"]["call_type"]
          needs_attention?: boolean
          next_attempt_at?: string | null
          notes?: string | null
          priority: number
          rescheduled_at?: string | null
          rescheduled_from_at?: string | null
          start_at: string
          status: Database["public"]["Enums"]["booking_status"]
          subject_id: string
          subject_type: Database["public"]["Enums"]["booking_subject_type"]
          updated_at?: string
          version?: number
        }
        Update: {
          attention_reason?:
            | Database["public"]["Enums"]["attention_reason"]
            | null
          booked_by_role?: Database["public"]["Enums"]["actor_role"]
          booked_by_user_id?: string | null
          calendar_id?: string
          call_note?: string | null
          call_outcome?: Database["public"]["Enums"]["call_outcome"] | null
          cancel_reason?:
            | Database["public"]["Enums"]["booking_cancel_reason"]
            | null
          created_at?: string
          displaced_at?: string | null
          displaced_by_booking_id?: string | null
          displaced_from_at?: string | null
          displacement_count?: number
          displacement_count_day?: string | null
          done_at?: string | null
          done_by?: string | null
          end_at?: string
          hold_expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          kind?: Database["public"]["Enums"]["call_type"]
          needs_attention?: boolean
          next_attempt_at?: string | null
          notes?: string | null
          priority?: number
          rescheduled_at?: string | null
          rescheduled_from_at?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          subject_id?: string
          subject_type?: Database["public"]["Enums"]["booking_subject_type"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bookings_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_displaced_by_booking_id_fkey"
            columns: ["displaced_by_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      calendars: {
        Row: {
          booking_horizon_days: number
          created_at: string
          hold_minutes: number
          id: string
          lead_time_minutes: number
          name: string
          owner_user_id: string | null
          slot_minutes: number
          timezone: string
          updated_at: string
        }
        Insert: {
          booking_horizon_days: number
          created_at?: string
          hold_minutes: number
          id?: string
          lead_time_minutes: number
          name: string
          owner_user_id?: string | null
          slot_minutes: number
          timezone: string
          updated_at?: string
        }
        Update: {
          booking_horizon_days?: number
          created_at?: string
          hold_minutes?: number
          id?: string
          lead_time_minutes?: number
          name?: string
          owner_user_id?: string | null
          slot_minutes?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_cost_daily: {
        Row: {
          bloombot_id: string
          cached_tokens: number
          created_at: string
          date: string
          estimated_cost_usd: number
          input_tokens: number
          output_tokens: number
          proactive_count: number
          turn_count: number
          updated_at: string
        }
        Insert: {
          bloombot_id: string
          cached_tokens?: number
          created_at?: string
          date: string
          estimated_cost_usd?: number
          input_tokens?: number
          output_tokens?: number
          proactive_count?: number
          turn_count?: number
          updated_at?: string
        }
        Update: {
          bloombot_id?: string
          cached_tokens?: number
          created_at?: string
          date?: string
          estimated_cost_usd?: number
          input_tokens?: number
          output_tokens?: number
          proactive_count?: number
          turn_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_cost_daily_bloombot_id_fkey"
            columns: ["bloombot_id"]
            isOneToOne: false
            referencedRelation: "bloombot"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_draft_locks: {
        Row: {
          acquired_at: string
          draft_id: string
          tool_name: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          draft_id: string
          tool_name: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          draft_id?: string
          tool_name?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          bloombot_id: string
          child_id: string | null
          content: string | null
          created_at: string
          id: string
          is_read: boolean
          metadata: Json | null
          proactive_schedule_id: string | null
          proactive_trigger_id: string | null
          role: Database["public"]["Enums"]["chat_role"]
          surface_feature: string | null
          surface_route: string | null
          tile: Json | null
          trigger_source: Database["public"]["Enums"]["chat_trigger_source"]
        }
        Insert: {
          bloombot_id: string
          child_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          metadata?: Json | null
          proactive_schedule_id?: string | null
          proactive_trigger_id?: string | null
          role: Database["public"]["Enums"]["chat_role"]
          surface_feature?: string | null
          surface_route?: string | null
          tile?: Json | null
          trigger_source?: Database["public"]["Enums"]["chat_trigger_source"]
        }
        Update: {
          bloombot_id?: string
          child_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          metadata?: Json | null
          proactive_schedule_id?: string | null
          proactive_trigger_id?: string | null
          role?: Database["public"]["Enums"]["chat_role"]
          surface_feature?: string | null
          surface_route?: string | null
          tile?: Json | null
          trigger_source?: Database["public"]["Enums"]["chat_trigger_source"]
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_bloombot_id_fkey"
            columns: ["bloombot_id"]
            isOneToOne: false
            referencedRelation: "bloombot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_proactive_schedule_id_fkey"
            columns: ["proactive_schedule_id"]
            isOneToOne: false
            referencedRelation: "proactive_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_summaries: {
        Row: {
          bloombot_id: string
          child_id: string | null
          created_at: string
          date_end: string
          date_start: string
          id: string
          key_events: Json | null
          message_count: number
          period: Database["public"]["Enums"]["summary_period"]
          summary: string
        }
        Insert: {
          bloombot_id: string
          child_id?: string | null
          created_at?: string
          date_end: string
          date_start: string
          id?: string
          key_events?: Json | null
          message_count?: number
          period?: Database["public"]["Enums"]["summary_period"]
          summary: string
        }
        Update: {
          bloombot_id?: string
          child_id?: string | null
          created_at?: string
          date_end?: string
          date_start?: string
          id?: string
          key_events?: Json | null
          message_count?: number
          period?: Database["public"]["Enums"]["summary_period"]
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_summaries_bloombot_id_fkey"
            columns: ["bloombot_id"]
            isOneToOne: false
            referencedRelation: "bloombot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_summaries_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      child_client: {
        Row: {
          child_id: string
          created_at: string
          end_reason: string | null
          ended_at: string | null
          ended_by: Database["public"]["Enums"]["actor_role"] | null
          id: string
          nanny_user_id: string
          parent_user_id: string | null
          placement_id: string | null
          source: Database["public"]["Enums"]["link_source"]
          state: Database["public"]["Enums"]["link_state"]
        }
        Insert: {
          child_id: string
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: Database["public"]["Enums"]["actor_role"] | null
          id?: string
          nanny_user_id: string
          parent_user_id?: string | null
          placement_id?: string | null
          source: Database["public"]["Enums"]["link_source"]
          state?: Database["public"]["Enums"]["link_state"]
        }
        Update: {
          child_id?: string
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: Database["public"]["Enums"]["actor_role"] | null
          id?: string
          nanny_user_id?: string
          parent_user_id?: string | null
          placement_id?: string | null
          source?: Database["public"]["Enums"]["link_source"]
          state?: Database["public"]["Enums"]["link_state"]
        }
        Relationships: [
          {
            foreignKeyName: "child_client_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_client_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "nanny_placements"
            referencedColumns: ["id"]
          },
        ]
      }
      child_invites: {
        Row: {
          child_id: string
          connected_at: string | null
          connected_by_user_id: string | null
          created_at: string
          created_by_email_at_creation: string | null
          created_by_user_id: string | null
          direction: Database["public"]["Enums"]["invite_direction"]
          id: string
          recipient_user_id: string | null
          revoked_at: string | null
          revoked_reason:
            | Database["public"]["Enums"]["invite_revoked_reason"]
            | null
          status: Database["public"]["Enums"]["invite_status"]
          token: string
          updated_at: string
        }
        Insert: {
          child_id: string
          connected_at?: string | null
          connected_by_user_id?: string | null
          created_at?: string
          created_by_email_at_creation?: string | null
          created_by_user_id?: string | null
          direction: Database["public"]["Enums"]["invite_direction"]
          id?: string
          recipient_user_id?: string | null
          revoked_at?: string | null
          revoked_reason?:
            | Database["public"]["Enums"]["invite_revoked_reason"]
            | null
          status?: Database["public"]["Enums"]["invite_status"]
          token: string
          updated_at?: string
        }
        Update: {
          child_id?: string
          connected_at?: string | null
          connected_by_user_id?: string | null
          created_at?: string
          created_by_email_at_creation?: string | null
          created_by_user_id?: string | null
          direction?: Database["public"]["Enums"]["invite_direction"]
          id?: string
          recipient_user_id?: string | null
          revoked_at?: string | null
          revoked_reason?:
            | Database["public"]["Enums"]["invite_revoked_reason"]
            | null
          status?: Database["public"]["Enums"]["invite_status"]
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_invites_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      children: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          date_of_birth: string
          feed_locked_at: string | null
          feed_locked_for_nanny: boolean
          first_name: string
          gender: string | null
          id: string
          onboarded: boolean
          orphaned_at: string | null
          parent_user_id: string | null
          profile_image_id: string | null
          status: Database["public"]["Enums"]["child_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          date_of_birth: string
          feed_locked_at?: string | null
          feed_locked_for_nanny?: boolean
          first_name: string
          gender?: string | null
          id?: string
          onboarded?: boolean
          orphaned_at?: string | null
          parent_user_id?: string | null
          profile_image_id?: string | null
          status?: Database["public"]["Enums"]["child_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          date_of_birth?: string
          feed_locked_at?: string | null
          feed_locked_for_nanny?: boolean
          first_name?: string
          gender?: string | null
          id?: string
          onboarded?: boolean
          orphaned_at?: string | null
          parent_user_id?: string | null
          profile_image_id?: string | null
          status?: Database["public"]["Enums"]["child_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "children_profile_image_id_fkey"
            columns: ["profile_image_id"]
            isOneToOne: false
            referencedRelation: "development_images"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_requests: {
        Row: {
          agreed_start_date: string | null
          availability_slots: Json | null
          created_at: string
          expires_at: string | null
          fill_initiated_by: Database["public"]["Enums"]["actor_role"] | null
          held_at: string | null
          held_for_verification: boolean
          id: string
          meeting_at: string | null
          meeting_bracket: string | null
          meeting_outcome: Database["public"]["Enums"]["meeting_outcome"] | null
          meeting_outcome_reported_at: string | null
          meeting_outcome_reported_by: string | null
          meeting_set_by: Database["public"]["Enums"]["actor_role"] | null
          message: string | null
          nanny_id: string | null
          origin: Database["public"]["Enums"]["connection_origin"]
          parent_id: string | null
          phone_exchanged_at: string | null
          position_id: string
          stage: Database["public"]["Enums"]["connection_stage"]
          trial_date: string | null
          trial_reported_at: string | null
          updated_at: string
          version: number
        }
        Insert: {
          agreed_start_date?: string | null
          availability_slots?: Json | null
          created_at?: string
          expires_at?: string | null
          fill_initiated_by?: Database["public"]["Enums"]["actor_role"] | null
          held_at?: string | null
          held_for_verification?: boolean
          id?: string
          meeting_at?: string | null
          meeting_bracket?: string | null
          meeting_outcome?:
            | Database["public"]["Enums"]["meeting_outcome"]
            | null
          meeting_outcome_reported_at?: string | null
          meeting_outcome_reported_by?: string | null
          meeting_set_by?: Database["public"]["Enums"]["actor_role"] | null
          message?: string | null
          nanny_id?: string | null
          origin: Database["public"]["Enums"]["connection_origin"]
          parent_id?: string | null
          phone_exchanged_at?: string | null
          position_id: string
          stage: Database["public"]["Enums"]["connection_stage"]
          trial_date?: string | null
          trial_reported_at?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          agreed_start_date?: string | null
          availability_slots?: Json | null
          created_at?: string
          expires_at?: string | null
          fill_initiated_by?: Database["public"]["Enums"]["actor_role"] | null
          held_at?: string | null
          held_for_verification?: boolean
          id?: string
          meeting_at?: string | null
          meeting_bracket?: string | null
          meeting_outcome?:
            | Database["public"]["Enums"]["meeting_outcome"]
            | null
          meeting_outcome_reported_at?: string | null
          meeting_outcome_reported_by?: string | null
          meeting_set_by?: Database["public"]["Enums"]["actor_role"] | null
          message?: string | null
          nanny_id?: string | null
          origin?: Database["public"]["Enums"]["connection_origin"]
          parent_id?: string | null
          phone_exchanged_at?: string | null
          position_id?: string
          stage?: Database["public"]["Enums"]["connection_stage"]
          trial_date?: string | null
          trial_reported_at?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "connection_requests_nanny_id_fkey"
            columns: ["nanny_id"]
            isOneToOne: false
            referencedRelation: "nannies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_requests_nanny_id_fkey"
            columns: ["nanny_id"]
            isOneToOne: false
            referencedRelation: "nanny_public"
            referencedColumns: ["nanny_id"]
          },
          {
            foreignKeyName: "connection_requests_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_requests_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "nanny_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          agreement_id: string
          checkpoint_id: string
          checkpoint_text: string
          consent_given: boolean
          created_at: string
          document_content_hash: string | null
          document_id: string | null
          document_version: number | null
          id: string
          ip_address: unknown
          party: Database["public"]["Enums"]["user_role"]
          purpose: Database["public"]["Enums"]["consent_purpose"]
          related_entity_id: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          agreement_id: string
          checkpoint_id: string
          checkpoint_text: string
          consent_given: boolean
          created_at?: string
          document_content_hash?: string | null
          document_id?: string | null
          document_version?: number | null
          id?: string
          ip_address?: unknown
          party: Database["public"]["Enums"]["user_role"]
          purpose: Database["public"]["Enums"]["consent_purpose"]
          related_entity_id?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          agreement_id?: string
          checkpoint_id?: string
          checkpoint_text?: string
          consent_given?: boolean
          created_at?: string
          document_content_hash?: string | null
          document_id?: string | null
          document_version?: number | null
          id?: string
          ip_address?: unknown
          party?: Database["public"]["Enums"]["user_role"]
          purpose?: Database["public"]["Enums"]["consent_purpose"]
          related_entity_id?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_document_fkey"
            columns: [
              "document_id",
              "document_version",
              "document_content_hash",
            ]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["document_id", "version", "content_hash"]
          },
        ]
      }
      contact_messages: {
        Row: {
          body: string
          category: Database["public"]["Enums"]["contact_category"]
          created_at: string
          id: string
          related_subscription_id: string | null
          replied_at: string | null
          replied_by: string | null
          reply_body: string | null
          reply_subject: string | null
          sender_email: string
          sender_name: string | null
          status: Database["public"]["Enums"]["contact_message_status"]
          subject: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          body: string
          category: Database["public"]["Enums"]["contact_category"]
          created_at?: string
          id?: string
          related_subscription_id?: string | null
          replied_at?: string | null
          replied_by?: string | null
          reply_body?: string | null
          reply_subject?: string | null
          sender_email: string
          sender_name?: string | null
          status?: Database["public"]["Enums"]["contact_message_status"]
          subject: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          body?: string
          category?: Database["public"]["Enums"]["contact_category"]
          created_at?: string
          id?: string
          related_subscription_id?: string | null
          replied_at?: string | null
          replied_by?: string | null
          reply_body?: string | null
          reply_subject?: string | null
          sender_email?: string
          sender_name?: string | null
          status?: Database["public"]["Enums"]["contact_message_status"]
          subject?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_messages_related_subscription_id_fkey"
            columns: ["related_subscription_id"]
            isOneToOne: false
            referencedRelation: "parent_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      cookie_consent_records: {
        Row: {
          analytics_enabled: boolean
          consent_choice: Database["public"]["Enums"]["cookie_choice"]
          created_at: string
          expiry_date: string
          id: string
          ip_address: unknown
          marketing_enabled: boolean
          superseded_by: string | null
          user_agent: string | null
          user_id: string | null
          visitor_id: string
        }
        Insert: {
          analytics_enabled: boolean
          consent_choice: Database["public"]["Enums"]["cookie_choice"]
          created_at?: string
          expiry_date: string
          id?: string
          ip_address?: unknown
          marketing_enabled: boolean
          superseded_by?: string | null
          user_agent?: string | null
          user_id?: string | null
          visitor_id: string
        }
        Update: {
          analytics_enabled?: boolean
          consent_choice?: Database["public"]["Enums"]["cookie_choice"]
          created_at?: string
          expiry_date?: string
          id?: string
          ip_address?: unknown
          marketing_enabled?: boolean
          superseded_by?: string | null
          user_agent?: string | null
          user_id?: string | null
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cookie_consent_records_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "cookie_consent_records"
            referencedColumns: ["id"]
          },
        ]
      }
      development_images: {
        Row: {
          bytes: number
          child_id: string | null
          consent_record_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          mime: string
          storage_path: string
          uploaded_by_user_id: string
        }
        Insert: {
          bytes: number
          child_id?: string | null
          consent_record_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          mime: string
          storage_path: string
          uploaded_by_user_id: string
        }
        Update: {
          bytes?: number
          child_id?: string | null
          consent_record_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          mime?: string
          storage_path?: string
          uploaded_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "development_images_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_images_consent_record_id_fkey"
            columns: ["consent_record_id"]
            isOneToOne: false
            referencedRelation: "consent_records"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          attempts: number
          body_html: string | null
          body_text: string | null
          cancelled_reason: string | null
          channel: Database["public"]["Enums"]["message_channel"]
          created_at: string
          data: Json | null
          dedupe_key: string | null
          error_code: string | null
          failed_at: string | null
          from_key: string | null
          id: string
          provider_message_id: string | null
          recipient_email: string | null
          recipient_user_id: string | null
          reference_id: string | null
          reference_type: string | null
          send_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["message_status"]
          subject: string | null
          template_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          body_html?: string | null
          body_text?: string | null
          cancelled_reason?: string | null
          channel?: Database["public"]["Enums"]["message_channel"]
          created_at?: string
          data?: Json | null
          dedupe_key?: string | null
          error_code?: string | null
          failed_at?: string | null
          from_key?: string | null
          id?: string
          provider_message_id?: string | null
          recipient_email?: string | null
          recipient_user_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          send_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          subject?: string | null
          template_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          body_html?: string | null
          body_text?: string | null
          cancelled_reason?: string | null
          channel?: Database["public"]["Enums"]["message_channel"]
          created_at?: string
          data?: Json | null
          dedupe_key?: string | null
          error_code?: string | null
          failed_at?: string | null
          from_key?: string | null
          id?: string
          provider_message_id?: string | null
          recipient_email?: string | null
          recipient_user_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          send_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          subject?: string | null
          template_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          actor_id: string | null
          actor_kind: Database["public"]["Enums"]["event_actor_kind"]
          attribution: Json | null
          capi_sent_at: string | null
          consent_marketing: boolean | null
          created_at: string
          dispatched_at: string | null
          from_stage: string | null
          id: string
          idempotency_key: string | null
          name: string
          on_behalf_of_id: string | null
          position_id: string | null
          props: Json
          request_id: string | null
          source: Database["public"]["Enums"]["event_source"]
          subject_id: string | null
          subject_kind: string | null
          system_job: string | null
          to_stage: string | null
          transition_id: string | null
          ts: string
          visitor_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_kind: Database["public"]["Enums"]["event_actor_kind"]
          attribution?: Json | null
          capi_sent_at?: string | null
          consent_marketing?: boolean | null
          created_at?: string
          dispatched_at?: string | null
          from_stage?: string | null
          id?: string
          idempotency_key?: string | null
          name: string
          on_behalf_of_id?: string | null
          position_id?: string | null
          props?: Json
          request_id?: string | null
          source: Database["public"]["Enums"]["event_source"]
          subject_id?: string | null
          subject_kind?: string | null
          system_job?: string | null
          to_stage?: string | null
          transition_id?: string | null
          ts?: string
          visitor_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_kind?: Database["public"]["Enums"]["event_actor_kind"]
          attribution?: Json | null
          capi_sent_at?: string | null
          consent_marketing?: boolean | null
          created_at?: string
          dispatched_at?: string | null
          from_stage?: string | null
          id?: string
          idempotency_key?: string | null
          name?: string
          on_behalf_of_id?: string | null
          position_id?: string | null
          props?: Json
          request_id?: string | null
          source?: Database["public"]["Enums"]["event_source"]
          subject_id?: string | null
          subject_kind?: string | null
          system_job?: string | null
          to_stage?: string | null
          transition_id?: string | null
          ts?: string
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "nanny_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_posts: {
        Row: {
          author_user_id: string | null
          child_id: string
          context: Database["public"]["Enums"]["post_context"]
          created_at: string
          data: Json
          id: string
          image_id: string | null
          internal_notes: string | null
          is_active: boolean
          parent_post_id: string | null
          source: Database["public"]["Enums"]["post_source"]
          status: Database["public"]["Enums"]["post_status"]
          type: Database["public"]["Enums"]["post_type"]
          updated_at: string
        }
        Insert: {
          author_user_id?: string | null
          child_id: string
          context?: Database["public"]["Enums"]["post_context"]
          created_at?: string
          data?: Json
          id?: string
          image_id?: string | null
          internal_notes?: string | null
          is_active?: boolean
          parent_post_id?: string | null
          source?: Database["public"]["Enums"]["post_source"]
          status?: Database["public"]["Enums"]["post_status"]
          type: Database["public"]["Enums"]["post_type"]
          updated_at?: string
        }
        Update: {
          author_user_id?: string | null
          child_id?: string
          context?: Database["public"]["Enums"]["post_context"]
          created_at?: string
          data?: Json
          id?: string
          image_id?: string | null
          internal_notes?: string | null
          is_active?: boolean
          parent_post_id?: string | null
          source?: Database["public"]["Enums"]["post_source"]
          status?: Database["public"]["Enums"]["post_status"]
          type?: Database["public"]["Enums"]["post_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_posts_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_posts_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "development_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_posts_parent_post_id_fkey"
            columns: ["parent_post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      file_retention_log: {
        Row: {
          bucket: string
          created_at: string
          deleted_at: string
          entity_id: string | null
          entity_kind: string
          id: string
          job: string
          path_hash: string
          reason: string
        }
        Insert: {
          bucket: string
          created_at?: string
          deleted_at?: string
          entity_id?: string | null
          entity_kind: string
          id?: string
          job: string
          path_hash: string
          reason: string
        }
        Update: {
          bucket?: string
          created_at?: string
          deleted_at?: string
          entity_id?: string | null
          entity_kind?: string
          id?: string
          job?: string
          path_hash?: string
          reason?: string
        }
        Relationships: []
      }
      guarantee_events: {
        Row: {
          claimed_at: string
          condition_met: boolean
          condition_met_at: string | null
          condition_note: string | null
          created_at: string
          decided_by: string | null
          id: string
          method: string | null
          note: string | null
          paid_at: string | null
          paid_out_pence: number | null
          paid_to: Database["public"]["Enums"]["guarantee_paid_to"] | null
          parent_subscription_id: string
          parent_user_id: string
          placement_id: string | null
          promise: Database["public"]["Enums"]["guarantee_promise"]
          refund_request_id: string | null
          updated_at: string
        }
        Insert: {
          claimed_at?: string
          condition_met?: boolean
          condition_met_at?: string | null
          condition_note?: string | null
          created_at?: string
          decided_by?: string | null
          id?: string
          method?: string | null
          note?: string | null
          paid_at?: string | null
          paid_out_pence?: number | null
          paid_to?: Database["public"]["Enums"]["guarantee_paid_to"] | null
          parent_subscription_id: string
          parent_user_id: string
          placement_id?: string | null
          promise: Database["public"]["Enums"]["guarantee_promise"]
          refund_request_id?: string | null
          updated_at?: string
        }
        Update: {
          claimed_at?: string
          condition_met?: boolean
          condition_met_at?: string | null
          condition_note?: string | null
          created_at?: string
          decided_by?: string | null
          id?: string
          method?: string | null
          note?: string | null
          paid_at?: string | null
          paid_out_pence?: number | null
          paid_to?: Database["public"]["Enums"]["guarantee_paid_to"] | null
          parent_subscription_id?: string
          parent_user_id?: string
          placement_id?: string | null
          promise?: Database["public"]["Enums"]["guarantee_promise"]
          refund_request_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guarantee_events_parent_subscription_id_fkey"
            columns: ["parent_subscription_id"]
            isOneToOne: false
            referencedRelation: "parent_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guarantee_events_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "nanny_placements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guarantee_events_refund_request_id_fkey"
            columns: ["refund_request_id"]
            isOneToOne: false
            referencedRelation: "refund_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_messages: {
        Row: {
          action_url: string | null
          actor: Database["public"]["Enums"]["mover"]
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          metadata: Json | null
          on_behalf_of_user_id: string | null
          position_id: string | null
          read_at: string | null
          reference_id: string | null
          reference_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          actor: Database["public"]["Enums"]["mover"]
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          metadata?: Json | null
          on_behalf_of_user_id?: string | null
          position_id?: string | null
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          actor?: Database["public"]["Enums"]["mover"]
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          metadata?: Json | null
          on_behalf_of_user_id?: string | null
          position_id?: string | null
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_messages_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "nanny_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      katie_prompt: {
        Row: {
          content: string
          created_at: string
          edit_reason: string | null
          edited_by: string | null
          is_active: boolean
          protected: boolean
          section: string
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          edit_reason?: string | null
          edited_by?: string | null
          is_active?: boolean
          protected?: boolean
          section: string
          version: number
        }
        Update: {
          content?: string
          created_at?: string
          edit_reason?: string | null
          edited_by?: string | null
          is_active?: boolean
          protected?: boolean
          section?: string
          version?: number
        }
        Relationships: []
      }
      katie_prompt_edits: {
        Row: {
          after_content: string | null
          after_version: number | null
          applied_at: string
          applied_by: string | null
          before_content: string | null
          before_version: number | null
          bloombot_id: string | null
          created_at: string
          diff: string | null
          id: string
          reason: string | null
          rolled_back_by_edit_id: string | null
          section: string
          status: Database["public"]["Enums"]["prompt_edit_status"]
        }
        Insert: {
          after_content?: string | null
          after_version?: number | null
          applied_at?: string
          applied_by?: string | null
          before_content?: string | null
          before_version?: number | null
          bloombot_id?: string | null
          created_at?: string
          diff?: string | null
          id?: string
          reason?: string | null
          rolled_back_by_edit_id?: string | null
          section: string
          status?: Database["public"]["Enums"]["prompt_edit_status"]
        }
        Update: {
          after_content?: string | null
          after_version?: number | null
          applied_at?: string
          applied_by?: string | null
          before_content?: string | null
          before_version?: number | null
          bloombot_id?: string | null
          created_at?: string
          diff?: string | null
          id?: string
          reason?: string | null
          rolled_back_by_edit_id?: string | null
          section?: string
          status?: Database["public"]["Enums"]["prompt_edit_status"]
        }
        Relationships: [
          {
            foreignKeyName: "katie_prompt_edits_bloombot_id_fkey"
            columns: ["bloombot_id"]
            isOneToOne: false
            referencedRelation: "bloombot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "katie_prompt_edits_rolled_back_by_edit_id_fkey"
            columns: ["rolled_back_by_edit_id"]
            isOneToOne: false
            referencedRelation: "katie_prompt_edits"
            referencedColumns: ["id"]
          },
        ]
      }
      katie_prompt_version: {
        Row: {
          id: string
          singleton: boolean
          updated_at: string
          version_hash: string
        }
        Insert: {
          id?: string
          singleton?: boolean
          updated_at?: string
          version_hash: string
        }
        Update: {
          id?: string
          singleton?: boolean
          updated_at?: string
          version_hash?: string
        }
        Relationships: []
      }
      katie_proposals: {
        Row: {
          bloombot_id: string | null
          created_at: string
          details: string | null
          id: string
          kind: Database["public"]["Enums"]["proposal_kind"]
          proposed_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          status: Database["public"]["Enums"]["proposal_status"]
          suggested_diff: string | null
          summary: string
          target: string | null
        }
        Insert: {
          bloombot_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          kind: Database["public"]["Enums"]["proposal_kind"]
          proposed_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          suggested_diff?: string | null
          summary: string
          target?: string | null
        }
        Update: {
          bloombot_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["proposal_kind"]
          proposed_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          suggested_diff?: string | null
          summary?: string
          target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "katie_proposals_bloombot_id_fkey"
            columns: ["bloombot_id"]
            isOneToOne: false
            referencedRelation: "bloombot"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_contacts: {
        Row: {
          booking_id: string | null
          contacted_at: string
          created_at: string
          direction: Database["public"]["Enums"]["contact_direction"]
          edited_by: string | null
          id: string
          method: Database["public"]["Enums"]["contact_method"]
          nanny_user_id: string
          note: string | null
          operator_handle: string | null
          outcome: Database["public"]["Enums"]["contact_outcome"]
          purpose: string | null
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          contacted_at?: string
          created_at?: string
          direction: Database["public"]["Enums"]["contact_direction"]
          edited_by?: string | null
          id?: string
          method: Database["public"]["Enums"]["contact_method"]
          nanny_user_id: string
          note?: string | null
          operator_handle?: string | null
          outcome?: Database["public"]["Enums"]["contact_outcome"]
          purpose?: string | null
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          contacted_at?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["contact_direction"]
          edited_by?: string | null
          id?: string
          method?: Database["public"]["Enums"]["contact_method"]
          nanny_user_id?: string
          note?: string | null
          operator_handle?: string | null
          outcome?: Database["public"]["Enums"]["contact_outcome"]
          purpose?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_contacts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          body: string
          created_at: string
          last_edited_by: string | null
          nanny_user_id: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          last_edited_by?: string | null
          nanny_user_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          last_edited_by?: string | null
          nanny_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      legal_documents: {
        Row: {
          body_md: string
          change_summary: string | null
          content_hash: string
          created_at: string
          document_id: string
          effective_date: string
          reacceptance_deadline: string | null
          requires_reacceptance: boolean
          version: number
        }
        Insert: {
          body_md: string
          change_summary?: string | null
          content_hash: string
          created_at?: string
          document_id: string
          effective_date: string
          reacceptance_deadline?: string | null
          requires_reacceptance?: boolean
          version: number
        }
        Update: {
          body_md?: string
          change_summary?: string | null
          content_hash?: string
          created_at?: string
          document_id?: string
          effective_date?: string
          reacceptance_deadline?: string | null
          requires_reacceptance?: boolean
          version?: number
        }
        Relationships: []
      }
      milestones: {
        Row: {
          age_bracket: Database["public"]["Enums"]["age_bracket"]
          created_at: string
          description: string
          domain: Database["public"]["Enums"]["dev_domain"]
          id: string
          is_active: boolean
          sort_order: number
        }
        Insert: {
          age_bracket: Database["public"]["Enums"]["age_bracket"]
          created_at?: string
          description: string
          domain: Database["public"]["Enums"]["dev_domain"]
          id: string
          is_active?: boolean
          sort_order: number
        }
        Update: {
          age_bracket?: Database["public"]["Enums"]["age_bracket"]
          created_at?: string
          description?: string
          domain?: Database["public"]["Enums"]["dev_domain"]
          id?: string
          is_active?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      nannies: {
        Row: {
          availability: Json | null
          available_from: string | null
          bio: string | null
          certificates: string[]
          comfortable_with_pets: boolean | null
          commission_pitch_opted_in_at: string | null
          created_at: string
          current_placement_id: string | null
          has_car: boolean | null
          has_driving_licence: boolean | null
          hourly_rate_min_pence: number | null
          id: string
          is_isolated: boolean
          is_non_smoker: boolean | null
          is_vaccinated: boolean | null
          isolation_lifted_at: string | null
          languages: string[]
          lead_id: string | null
          profile_visible: boolean
          qualification: string | null
          suspended_at: string | null
          updated_at: string
          user_id: string
          verification_level: Database["public"]["Enums"]["verification_level"]
          verification_synced_at: string | null
          years_experience: number | null
        }
        Insert: {
          availability?: Json | null
          available_from?: string | null
          bio?: string | null
          certificates?: string[]
          comfortable_with_pets?: boolean | null
          commission_pitch_opted_in_at?: string | null
          created_at?: string
          current_placement_id?: string | null
          has_car?: boolean | null
          has_driving_licence?: boolean | null
          hourly_rate_min_pence?: number | null
          id?: string
          is_isolated?: boolean
          is_non_smoker?: boolean | null
          is_vaccinated?: boolean | null
          isolation_lifted_at?: string | null
          languages?: string[]
          lead_id?: string | null
          profile_visible?: boolean
          qualification?: string | null
          suspended_at?: string | null
          updated_at?: string
          user_id: string
          verification_level?: Database["public"]["Enums"]["verification_level"]
          verification_synced_at?: string | null
          years_experience?: number | null
        }
        Update: {
          availability?: Json | null
          available_from?: string | null
          bio?: string | null
          certificates?: string[]
          comfortable_with_pets?: boolean | null
          commission_pitch_opted_in_at?: string | null
          created_at?: string
          current_placement_id?: string | null
          has_car?: boolean | null
          has_driving_licence?: boolean | null
          hourly_rate_min_pence?: number | null
          id?: string
          is_isolated?: boolean
          is_non_smoker?: boolean | null
          is_vaccinated?: boolean | null
          isolation_lifted_at?: string | null
          languages?: string[]
          lead_id?: string | null
          profile_visible?: boolean
          qualification?: string | null
          suspended_at?: string | null
          updated_at?: string
          user_id?: string
          verification_level?: Database["public"]["Enums"]["verification_level"]
          verification_synced_at?: string | null
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nannies_current_placement_id_fkey"
            columns: ["current_placement_id"]
            isOneToOne: false
            referencedRelation: "nanny_placements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nannies_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "nanny_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      nanny_contact_state: {
        Row: {
          assigned_operator: string | null
          created_at: string
          is_isolated: boolean
          last_contact_at: string | null
          lead_status: Database["public"]["Enums"]["lead_contact_status"]
          nanny_user_id: string
          next_action_at: string | null
          responded_ever_override: boolean | null
          total_contacts_manual_offset: number
          updated_at: string
        }
        Insert: {
          assigned_operator?: string | null
          created_at?: string
          is_isolated?: boolean
          last_contact_at?: string | null
          lead_status?: Database["public"]["Enums"]["lead_contact_status"]
          nanny_user_id: string
          next_action_at?: string | null
          responded_ever_override?: boolean | null
          total_contacts_manual_offset?: number
          updated_at?: string
        }
        Update: {
          assigned_operator?: string | null
          created_at?: string
          is_isolated?: boolean
          last_contact_at?: string | null
          lead_status?: Database["public"]["Enums"]["lead_contact_status"]
          nanny_user_id?: string
          next_action_at?: string | null
          responded_ever_override?: boolean | null
          total_contacts_manual_offset?: number
          updated_at?: string
        }
        Relationships: []
      }
      nanny_leads: {
        Row: {
          about_you: Json | null
          ai_bio: string | null
          ai_content: Json | null
          ai_model: string | null
          area: string | null
          auth_user_id: string | null
          availability: Json | null
          converted_at: string | null
          created_at: string
          district: string | null
          email: string
          experience: Json | null
          first_name: string | null
          funnel_step: string | null
          id: string
          identity: Json | null
          last_active_at: string | null
          last_name: string | null
          lead_signals: Json | null
          lead_status: Database["public"]["Enums"]["nanny_lead_status"]
          lives_in_service_area: boolean | null
          matching: Json | null
          phone: string | null
          preferences: Json | null
          qualifications: Json | null
          right_to_work_evidence_type: string | null
          right_to_work_expires_on: string | null
          right_to_work_status: Database["public"]["Enums"]["lead_rtw_status"]
          salary: Json | null
          source: string | null
          terms_accepted_at: string | null
          updated_at: string
        }
        Insert: {
          about_you?: Json | null
          ai_bio?: string | null
          ai_content?: Json | null
          ai_model?: string | null
          area?: string | null
          auth_user_id?: string | null
          availability?: Json | null
          converted_at?: string | null
          created_at?: string
          district?: string | null
          email: string
          experience?: Json | null
          first_name?: string | null
          funnel_step?: string | null
          id?: string
          identity?: Json | null
          last_active_at?: string | null
          last_name?: string | null
          lead_signals?: Json | null
          lead_status?: Database["public"]["Enums"]["nanny_lead_status"]
          lives_in_service_area?: boolean | null
          matching?: Json | null
          phone?: string | null
          preferences?: Json | null
          qualifications?: Json | null
          right_to_work_evidence_type?: string | null
          right_to_work_expires_on?: string | null
          right_to_work_status?: Database["public"]["Enums"]["lead_rtw_status"]
          salary?: Json | null
          source?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Update: {
          about_you?: Json | null
          ai_bio?: string | null
          ai_content?: Json | null
          ai_model?: string | null
          area?: string | null
          auth_user_id?: string | null
          availability?: Json | null
          converted_at?: string | null
          created_at?: string
          district?: string | null
          email?: string
          experience?: Json | null
          first_name?: string | null
          funnel_step?: string | null
          id?: string
          identity?: Json | null
          last_active_at?: string | null
          last_name?: string | null
          lead_signals?: Json | null
          lead_status?: Database["public"]["Enums"]["nanny_lead_status"]
          lives_in_service_area?: boolean | null
          matching?: Json | null
          phone?: string | null
          preferences?: Json | null
          qualifications?: Json | null
          right_to_work_evidence_type?: string | null
          right_to_work_expires_on?: string | null
          right_to_work_status?: Database["public"]["Enums"]["lead_rtw_status"]
          salary?: Json | null
          source?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nanny_leads_district_fkey"
            columns: ["district"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["district"]
          },
        ]
      }
      nanny_placements: {
        Row: {
          confirmed_at: string | null
          confirmed_by_id: string | null
          confirmed_by_role: Database["public"]["Enums"]["actor_role"] | null
          connection_id: string | null
          created_at: string
          end_notes: string | null
          end_reason: Database["public"]["Enums"]["end_reason"] | null
          ended_at: string | null
          ended_by_id: string | null
          ended_by_role: Database["public"]["Enums"]["actor_role"] | null
          hourly_rate_pence: number | null
          id: string
          nanny_id: string | null
          nanny_notes: string | null
          parent_id: string | null
          parent_notes: string | null
          position_id: string
          roster: Json | null
          source: Database["public"]["Enums"]["placement_source"]
          start_date: string | null
          started_at: string | null
          state: Database["public"]["Enums"]["placement_state"]
          updated_at: string
          version: number
          weekly_hours: number | null
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by_id?: string | null
          confirmed_by_role?: Database["public"]["Enums"]["actor_role"] | null
          connection_id?: string | null
          created_at?: string
          end_notes?: string | null
          end_reason?: Database["public"]["Enums"]["end_reason"] | null
          ended_at?: string | null
          ended_by_id?: string | null
          ended_by_role?: Database["public"]["Enums"]["actor_role"] | null
          hourly_rate_pence?: number | null
          id?: string
          nanny_id?: string | null
          nanny_notes?: string | null
          parent_id?: string | null
          parent_notes?: string | null
          position_id: string
          roster?: Json | null
          source: Database["public"]["Enums"]["placement_source"]
          start_date?: string | null
          started_at?: string | null
          state: Database["public"]["Enums"]["placement_state"]
          updated_at?: string
          version?: number
          weekly_hours?: number | null
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by_id?: string | null
          confirmed_by_role?: Database["public"]["Enums"]["actor_role"] | null
          connection_id?: string | null
          created_at?: string
          end_notes?: string | null
          end_reason?: Database["public"]["Enums"]["end_reason"] | null
          ended_at?: string | null
          ended_by_id?: string | null
          ended_by_role?: Database["public"]["Enums"]["actor_role"] | null
          hourly_rate_pence?: number | null
          id?: string
          nanny_id?: string | null
          nanny_notes?: string | null
          parent_id?: string | null
          parent_notes?: string | null
          position_id?: string
          roster?: Json | null
          source?: Database["public"]["Enums"]["placement_source"]
          start_date?: string | null
          started_at?: string | null
          state?: Database["public"]["Enums"]["placement_state"]
          updated_at?: string
          version?: number
          weekly_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nanny_placements_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "connection_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nanny_placements_nanny_id_fkey"
            columns: ["nanny_id"]
            isOneToOne: false
            referencedRelation: "nannies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nanny_placements_nanny_id_fkey"
            columns: ["nanny_id"]
            isOneToOne: false
            referencedRelation: "nanny_public"
            referencedColumns: ["nanny_id"]
          },
          {
            foreignKeyName: "nanny_placements_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nanny_placements_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "nanny_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      nanny_positions: {
        Row: {
          activated_at: string | null
          area: string | null
          assurances_required: string[]
          call_booking_id: string | null
          call_requested_at: string | null
          call_state: Database["public"]["Enums"]["call_state"]
          call_type: Database["public"]["Enums"]["call_type"] | null
          car_required: boolean | null
          certificate_requirements: string[]
          close_reason: Database["public"]["Enums"]["close_reason"] | null
          closed_at: string | null
          created_at: string
          days_required: string[]
          description: string | null
          details: Json | null
          district: string | null
          driving_licence_required: boolean | null
          end_date: string | null
          end_reason: Database["public"]["Enums"]["end_reason"] | null
          ended_at: string | null
          expires_at: string | null
          filled_by_nanny_id: string | null
          hourly_rate_pence: number | null
          hours_per_week: number | null
          id: string
          language_preference: string[]
          language_preference_details: string | null
          level_of_support: string[]
          minimum_nanny_age: number | null
          non_smoker_required: boolean | null
          other_requirements: string | null
          parent_id: string | null
          pay_frequency: string[]
          pets_ok_required: boolean | null
          placement_length: string | null
          precheck_cutoff_reached_at: string | null
          precheck_expires_at: string | null
          precheck_fired_at: string | null
          precheck_wave_sent: number
          published_at: string | null
          qualification_requirement: string | null
          reason_for_nanny: string[]
          right_to_work_requirement: string | null
          schedule_details: string | null
          schedule_type: Database["public"]["Enums"]["schedule_type"] | null
          source: Database["public"]["Enums"]["position_source"]
          stage: Database["public"]["Enums"]["position_stage"]
          start_date: string | null
          title: string | null
          updated_at: string
          urgency: string | null
          vaccination_required: boolean | null
          version: number
          years_experience_min: number | null
        }
        Insert: {
          activated_at?: string | null
          area?: string | null
          assurances_required?: string[]
          call_booking_id?: string | null
          call_requested_at?: string | null
          call_state?: Database["public"]["Enums"]["call_state"]
          call_type?: Database["public"]["Enums"]["call_type"] | null
          car_required?: boolean | null
          certificate_requirements?: string[]
          close_reason?: Database["public"]["Enums"]["close_reason"] | null
          closed_at?: string | null
          created_at?: string
          days_required?: string[]
          description?: string | null
          details?: Json | null
          district?: string | null
          driving_licence_required?: boolean | null
          end_date?: string | null
          end_reason?: Database["public"]["Enums"]["end_reason"] | null
          ended_at?: string | null
          expires_at?: string | null
          filled_by_nanny_id?: string | null
          hourly_rate_pence?: number | null
          hours_per_week?: number | null
          id?: string
          language_preference?: string[]
          language_preference_details?: string | null
          level_of_support?: string[]
          minimum_nanny_age?: number | null
          non_smoker_required?: boolean | null
          other_requirements?: string | null
          parent_id?: string | null
          pay_frequency?: string[]
          pets_ok_required?: boolean | null
          placement_length?: string | null
          precheck_cutoff_reached_at?: string | null
          precheck_expires_at?: string | null
          precheck_fired_at?: string | null
          precheck_wave_sent?: number
          published_at?: string | null
          qualification_requirement?: string | null
          reason_for_nanny?: string[]
          right_to_work_requirement?: string | null
          schedule_details?: string | null
          schedule_type?: Database["public"]["Enums"]["schedule_type"] | null
          source: Database["public"]["Enums"]["position_source"]
          stage?: Database["public"]["Enums"]["position_stage"]
          start_date?: string | null
          title?: string | null
          updated_at?: string
          urgency?: string | null
          vaccination_required?: boolean | null
          version?: number
          years_experience_min?: number | null
        }
        Update: {
          activated_at?: string | null
          area?: string | null
          assurances_required?: string[]
          call_booking_id?: string | null
          call_requested_at?: string | null
          call_state?: Database["public"]["Enums"]["call_state"]
          call_type?: Database["public"]["Enums"]["call_type"] | null
          car_required?: boolean | null
          certificate_requirements?: string[]
          close_reason?: Database["public"]["Enums"]["close_reason"] | null
          closed_at?: string | null
          created_at?: string
          days_required?: string[]
          description?: string | null
          details?: Json | null
          district?: string | null
          driving_licence_required?: boolean | null
          end_date?: string | null
          end_reason?: Database["public"]["Enums"]["end_reason"] | null
          ended_at?: string | null
          expires_at?: string | null
          filled_by_nanny_id?: string | null
          hourly_rate_pence?: number | null
          hours_per_week?: number | null
          id?: string
          language_preference?: string[]
          language_preference_details?: string | null
          level_of_support?: string[]
          minimum_nanny_age?: number | null
          non_smoker_required?: boolean | null
          other_requirements?: string | null
          parent_id?: string | null
          pay_frequency?: string[]
          pets_ok_required?: boolean | null
          placement_length?: string | null
          precheck_cutoff_reached_at?: string | null
          precheck_expires_at?: string | null
          precheck_fired_at?: string | null
          precheck_wave_sent?: number
          published_at?: string | null
          qualification_requirement?: string | null
          reason_for_nanny?: string[]
          right_to_work_requirement?: string | null
          schedule_details?: string | null
          schedule_type?: Database["public"]["Enums"]["schedule_type"] | null
          source?: Database["public"]["Enums"]["position_source"]
          stage?: Database["public"]["Enums"]["position_stage"]
          start_date?: string | null
          title?: string | null
          updated_at?: string
          urgency?: string | null
          vaccination_required?: boolean | null
          version?: number
          years_experience_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nanny_positions_call_booking_id_fkey"
            columns: ["call_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nanny_positions_district_fkey"
            columns: ["district"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["district"]
          },
          {
            foreignKeyName: "nanny_positions_filled_by_nanny_id_fkey"
            columns: ["filled_by_nanny_id"]
            isOneToOne: false
            referencedRelation: "nannies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nanny_positions_filled_by_nanny_id_fkey"
            columns: ["filled_by_nanny_id"]
            isOneToOne: false
            referencedRelation: "nanny_public"
            referencedColumns: ["nanny_id"]
          },
          {
            foreignKeyName: "nanny_positions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      nanny_suspension_lifts: {
        Row: {
          decided_at: string
          decided_by: string
          id: string
          nanny_id: string | null
          previous_dbs_outcome: Database["public"]["Enums"]["dbs_outcome"]
          reason: string
          subject_pseudonym: string | null
          suspended_since: string
        }
        Insert: {
          decided_at?: string
          decided_by: string
          id?: string
          nanny_id?: string | null
          previous_dbs_outcome: Database["public"]["Enums"]["dbs_outcome"]
          reason: string
          subject_pseudonym?: string | null
          suspended_since: string
        }
        Update: {
          decided_at?: string
          decided_by?: string
          id?: string
          nanny_id?: string | null
          previous_dbs_outcome?: Database["public"]["Enums"]["dbs_outcome"]
          reason?: string
          subject_pseudonym?: string | null
          suspended_since?: string
        }
        Relationships: [
          {
            foreignKeyName: "nanny_suspension_lifts_nanny_id_fkey"
            columns: ["nanny_id"]
            isOneToOne: false
            referencedRelation: "nannies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nanny_suspension_lifts_nanny_id_fkey"
            columns: ["nanny_id"]
            isOneToOne: false
            referencedRelation: "nanny_public"
            referencedColumns: ["nanny_id"]
          },
        ]
      }
      parent_leads: {
        Row: {
          area: string | null
          converted_at: string | null
          converted_to_user_id: string | null
          created_at: string
          district: string | null
          email: string | null
          form_data: Json
          id: string
          position_id: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          area?: string | null
          converted_at?: string | null
          converted_to_user_id?: string | null
          created_at?: string
          district?: string | null
          email?: string | null
          form_data?: Json
          id: string
          position_id?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          area?: string | null
          converted_at?: string | null
          converted_to_user_id?: string | null
          created_at?: string
          district?: string | null
          email?: string | null
          form_data?: Json
          id?: string
          position_id?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_leads_district_fkey"
            columns: ["district"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["district"]
          },
          {
            foreignKeyName: "parent_leads_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "nanny_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_subscriptions: {
        Row: {
          access_end_reminder_sent_at: string | null
          access_toggle_reason: string | null
          access_toggle_until: string | null
          access_toggled_at: string | null
          access_toggled_by: string | null
          access_toggled_on: boolean | null
          access_until: string | null
          balance_link_ref: string | null
          balance_pence: number | null
          cancellation_reason:
            | Database["public"]["Enums"]["cancellation_reason"]
            | null
          cancellation_text: string | null
          cancelled_at: string | null
          created_at: string
          current_period_ends_at: string | null
          deposit_link_ref: string | null
          deposit_paid_at: string | null
          deposit_pence: number | null
          deposit_refunded_at: string | null
          dfy_access_opened_at: string | null
          first_week_wages_pence: number | null
          has_used_trial: boolean
          id: string
          instalments_paid: number | null
          instalments_total: number | null
          parent_user_id: string
          past_due_grace_ends_at: string | null
          payment_due_at: string | null
          placement_id: string | null
          plan_shape: Database["public"]["Enums"]["plan_shape"] | null
          price_pence: number | null
          price_preset: string | null
          price_version: string | null
          purchase_path: Database["public"]["Enums"]["purchase_path"] | null
          purchased_at: string | null
          satisfaction_window_ends_at: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          stripe_payment_link_id: string | null
          stripe_subscription_id: string | null
          stripe_subscription_schedule_id: string | null
          trial_ends_at: string | null
          trial_reminder_sent_at: string | null
          trial_started_at: string | null
          updated_at: string
        }
        Insert: {
          access_end_reminder_sent_at?: string | null
          access_toggle_reason?: string | null
          access_toggle_until?: string | null
          access_toggled_at?: string | null
          access_toggled_by?: string | null
          access_toggled_on?: boolean | null
          access_until?: string | null
          balance_link_ref?: string | null
          balance_pence?: number | null
          cancellation_reason?:
            | Database["public"]["Enums"]["cancellation_reason"]
            | null
          cancellation_text?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_period_ends_at?: string | null
          deposit_link_ref?: string | null
          deposit_paid_at?: string | null
          deposit_pence?: number | null
          deposit_refunded_at?: string | null
          dfy_access_opened_at?: string | null
          first_week_wages_pence?: number | null
          has_used_trial?: boolean
          id?: string
          instalments_paid?: number | null
          instalments_total?: number | null
          parent_user_id: string
          past_due_grace_ends_at?: string | null
          payment_due_at?: string | null
          placement_id?: string | null
          plan_shape?: Database["public"]["Enums"]["plan_shape"] | null
          price_pence?: number | null
          price_preset?: string | null
          price_version?: string | null
          purchase_path?: Database["public"]["Enums"]["purchase_path"] | null
          purchased_at?: string | null
          satisfaction_window_ends_at?: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_link_id?: string | null
          stripe_subscription_id?: string | null
          stripe_subscription_schedule_id?: string | null
          trial_ends_at?: string | null
          trial_reminder_sent_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Update: {
          access_end_reminder_sent_at?: string | null
          access_toggle_reason?: string | null
          access_toggle_until?: string | null
          access_toggled_at?: string | null
          access_toggled_by?: string | null
          access_toggled_on?: boolean | null
          access_until?: string | null
          balance_link_ref?: string | null
          balance_pence?: number | null
          cancellation_reason?:
            | Database["public"]["Enums"]["cancellation_reason"]
            | null
          cancellation_text?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_period_ends_at?: string | null
          deposit_link_ref?: string | null
          deposit_paid_at?: string | null
          deposit_pence?: number | null
          deposit_refunded_at?: string | null
          dfy_access_opened_at?: string | null
          first_week_wages_pence?: number | null
          has_used_trial?: boolean
          id?: string
          instalments_paid?: number | null
          instalments_total?: number | null
          parent_user_id?: string
          past_due_grace_ends_at?: string | null
          payment_due_at?: string | null
          placement_id?: string | null
          plan_shape?: Database["public"]["Enums"]["plan_shape"] | null
          price_pence?: number | null
          price_preset?: string | null
          price_version?: string | null
          purchase_path?: Database["public"]["Enums"]["purchase_path"] | null
          purchased_at?: string | null
          satisfaction_window_ends_at?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_link_id?: string | null
          stripe_subscription_id?: string | null
          stripe_subscription_schedule_id?: string | null
          trial_ends_at?: string | null
          trial_reminder_sent_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_subscriptions_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "nanny_placements"
            referencedColumns: ["id"]
          },
        ]
      }
      parents: {
        Row: {
          created_at: string
          current_nanny_id: string | null
          current_placement_id: string | null
          id: string
          invited_by_nanny_id: string | null
          signup_source: Database["public"]["Enums"]["signup_source"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_nanny_id?: string | null
          current_placement_id?: string | null
          id?: string
          invited_by_nanny_id?: string | null
          signup_source: Database["public"]["Enums"]["signup_source"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_nanny_id?: string | null
          current_placement_id?: string | null
          id?: string
          invited_by_nanny_id?: string | null
          signup_source?: Database["public"]["Enums"]["signup_source"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parents_current_nanny_id_fkey"
            columns: ["current_nanny_id"]
            isOneToOne: false
            referencedRelation: "nannies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parents_current_nanny_id_fkey"
            columns: ["current_nanny_id"]
            isOneToOne: false
            referencedRelation: "nanny_public"
            referencedColumns: ["nanny_id"]
          },
          {
            foreignKeyName: "parents_current_placement_id_fkey"
            columns: ["current_placement_id"]
            isOneToOne: false
            referencedRelation: "nanny_placements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parents_invited_by_nanny_id_fkey"
            columns: ["invited_by_nanny_id"]
            isOneToOne: false
            referencedRelation: "nannies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parents_invited_by_nanny_id_fkey"
            columns: ["invited_by_nanny_id"]
            isOneToOne: false
            referencedRelation: "nanny_public"
            referencedColumns: ["nanny_id"]
          },
        ]
      }
      payment_events: {
        Row: {
          event_type: string
          id: string
          outcome: string | null
          parent_user_id: string | null
          payload: Json
          processed_at: string | null
          processing_error: string | null
          provider: string
          provider_event_id: string
          received_at: string
          retry_count: number
        }
        Insert: {
          event_type: string
          id?: string
          outcome?: string | null
          parent_user_id?: string | null
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          provider: string
          provider_event_id: string
          received_at?: string
          retry_count?: number
        }
        Update: {
          event_type?: string
          id?: string
          outcome?: string | null
          parent_user_id?: string | null
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          provider?: string
          provider_event_id?: string
          received_at?: string
          retry_count?: number
        }
        Relationships: []
      }
      pipeline_snapshots: {
        Row: {
          computed_at: string
          created_at: string
          id: string
          section_key: string
          snapshot_date: string
          stages: Json
        }
        Insert: {
          computed_at?: string
          created_at?: string
          id?: string
          section_key: string
          snapshot_date: string
          stages: Json
        }
        Update: {
          computed_at?: string
          created_at?: string
          id?: string
          section_key?: string
          snapshot_date?: string
          stages?: Json
        }
        Relationships: []
      }
      position_call_mirror: {
        Row: {
          about_nanny: string | null
          created_at: string
          no_answer_count: number
          notes: string | null
          outcome: Database["public"]["Enums"]["call_outcome"] | null
          position_id: string
          updated_at: string
          version: number
        }
        Insert: {
          about_nanny?: string | null
          created_at?: string
          no_answer_count?: number
          notes?: string | null
          outcome?: Database["public"]["Enums"]["call_outcome"] | null
          position_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          about_nanny?: string | null
          created_at?: string
          no_answer_count?: number
          notes?: string | null
          outcome?: Database["public"]["Enums"]["call_outcome"] | null
          position_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "position_call_mirror_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: true
            referencedRelation: "nanny_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      position_children: {
        Row: {
          age_months: number | null
          child_label: string
          created_at: string
          display_order: number
          gender: string | null
          id: string
          needs_details: string | null
          position_id: string
        }
        Insert: {
          age_months?: number | null
          child_label: string
          created_at?: string
          display_order?: number
          gender?: string | null
          id?: string
          needs_details?: string | null
          position_id: string
        }
        Update: {
          age_months?: number | null
          child_label?: string
          created_at?: string
          display_order?: number
          gender?: string | null
          id?: string
          needs_details?: string | null
          position_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_children_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "nanny_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      position_schedule: {
        Row: {
          created_at: string
          position_id: string
          schedule: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          position_id: string
          schedule: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          position_id?: string
          schedule?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_schedule_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: true
            referencedRelation: "nanny_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      precheck_notifications: {
        Row: {
          connection_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          nanny_id: string | null
          notified_at: string
          position_id: string
          responded_at: string | null
          score_at_fire: number | null
          selected_time_slots: Json | null
          status: Database["public"]["Enums"]["precheck_status"]
          viewed_at: string | null
          wave: number
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          nanny_id?: string | null
          notified_at?: string
          position_id: string
          responded_at?: string | null
          score_at_fire?: number | null
          selected_time_slots?: Json | null
          status?: Database["public"]["Enums"]["precheck_status"]
          viewed_at?: string | null
          wave?: number
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          nanny_id?: string | null
          notified_at?: string
          position_id?: string
          responded_at?: string | null
          score_at_fire?: number | null
          selected_time_slots?: Json | null
          status?: Database["public"]["Enums"]["precheck_status"]
          viewed_at?: string | null
          wave?: number
        }
        Relationships: [
          {
            foreignKeyName: "precheck_notifications_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connection_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precheck_notifications_nanny_id_fkey"
            columns: ["nanny_id"]
            isOneToOne: false
            referencedRelation: "nannies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precheck_notifications_nanny_id_fkey"
            columns: ["nanny_id"]
            isOneToOne: false
            referencedRelation: "nanny_public"
            referencedColumns: ["nanny_id"]
          },
          {
            foreignKeyName: "precheck_notifications_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "nanny_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      proactive_schedules: {
        Row: {
          active: boolean
          bloombot_id: string
          child_id: string | null
          created_at: string
          created_by: Database["public"]["Enums"]["schedule_created_by"]
          cron_expr: string | null
          description: string | null
          id: string
          last_error: string | null
          last_run_at: string | null
          last_status: string | null
          mode: Database["public"]["Enums"]["schedule_mode"]
          module_id: string | null
          next_run_at: string | null
          one_time_at: string | null
          payload: Json | null
          prompt_fragment: string | null
          template: string | null
          timezone: string
          trigger_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          bloombot_id: string
          child_id?: string | null
          created_at?: string
          created_by?: Database["public"]["Enums"]["schedule_created_by"]
          cron_expr?: string | null
          description?: string | null
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          mode?: Database["public"]["Enums"]["schedule_mode"]
          module_id?: string | null
          next_run_at?: string | null
          one_time_at?: string | null
          payload?: Json | null
          prompt_fragment?: string | null
          template?: string | null
          timezone: string
          trigger_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          bloombot_id?: string
          child_id?: string | null
          created_at?: string
          created_by?: Database["public"]["Enums"]["schedule_created_by"]
          cron_expr?: string | null
          description?: string | null
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          mode?: Database["public"]["Enums"]["schedule_mode"]
          module_id?: string | null
          next_run_at?: string | null
          one_time_at?: string | null
          payload?: Json | null
          prompt_fragment?: string | null
          template?: string | null
          timezone?: string
          trigger_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proactive_schedules_bloombot_id_fkey"
            columns: ["bloombot_id"]
            isOneToOne: false
            referencedRelation: "bloombot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proactive_schedules_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_history: {
        Row: {
          child_id: string
          created_at: string
          id: string
          ref_post_id: string | null
          totals: Json
        }
        Insert: {
          child_id: string
          created_at?: string
          id?: string
          ref_post_id?: string | null
          totals: Json
        }
        Update: {
          child_id?: string
          created_at?: string
          id?: string
          ref_post_id?: string | null
          totals?: Json
        }
        Relationships: [
          {
            foreignKeyName: "progress_history_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_history_ref_post_id_fkey"
            columns: ["ref_post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_scores: {
        Row: {
          child_id: string
          created_at: string
          domain: Database["public"]["Enums"]["dev_domain"]
          percent: number
          scores: Json
          updated_at: string
        }
        Insert: {
          child_id: string
          created_at?: string
          domain: Database["public"]["Enums"]["dev_domain"]
          percent?: number
          scores?: Json
          updated_at?: string
        }
        Update: {
          child_id?: string
          created_at?: string
          domain?: Database["public"]["Enums"]["dev_domain"]
          percent?: number
          scores?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_scores_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_buckets: {
        Row: {
          bucket: string
          count: number
          reset_at: string
          updated_at: string
        }
        Insert: {
          bucket: string
          count: number
          reset_at: string
          updated_at?: string
        }
        Update: {
          bucket?: string
          count?: number
          reset_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      refund_requests: {
        Row: {
          admin_notes: string | null
          contact_message_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          parent_subscription_id: string
          parent_user_id: string
          reason: Database["public"]["Enums"]["refund_reason"]
          refunded_pence: number | null
          requested_pence: number
          status: Database["public"]["Enums"]["refund_status"]
          stripe_charge_id: string | null
          stripe_refund_id: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          contact_message_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          parent_subscription_id: string
          parent_user_id: string
          reason: Database["public"]["Enums"]["refund_reason"]
          refunded_pence?: number | null
          requested_pence: number
          status?: Database["public"]["Enums"]["refund_status"]
          stripe_charge_id?: string | null
          stripe_refund_id?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          contact_message_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          parent_subscription_id?: string
          parent_user_id?: string
          reason?: Database["public"]["Enums"]["refund_reason"]
          refunded_pence?: number | null
          requested_pence?: number
          status?: Database["public"]["Enums"]["refund_status"]
          stripe_charge_id?: string | null
          stripe_refund_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_requests_contact_message_id_fkey"
            columns: ["contact_message_id"]
            isOneToOne: false
            referencedRelation: "contact_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_parent_subscription_id_fkey"
            columns: ["parent_subscription_id"]
            isOneToOne: false
            referencedRelation: "parent_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscribe_invites: {
        Row: {
          child_id: string
          created_at: string
          expires_at: string | null
          id: string
          nanny_user_id: string
          parent_user_id: string | null
          redeemed_at: string | null
          status: Database["public"]["Enums"]["subscribe_invite_status"]
          token: string
          updated_at: string
        }
        Insert: {
          child_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          nanny_user_id: string
          parent_user_id?: string | null
          redeemed_at?: string | null
          status?: Database["public"]["Enums"]["subscribe_invite_status"]
          token: string
          updated_at?: string
        }
        Update: {
          child_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          nanny_user_id?: string
          parent_user_id?: string | null
          redeemed_at?: string | null
          status?: Database["public"]["Enums"]["subscribe_invite_status"]
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscribe_invites_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          area: string | null
          created_at: string
          date_of_birth: string | null
          deactivated_at: string | null
          district: string | null
          email: string | null
          first_name: string | null
          id: string
          is_test_user: boolean
          last_name: string | null
          mobile: string | null
          profile_picture_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          area?: string | null
          created_at?: string
          date_of_birth?: string | null
          deactivated_at?: string | null
          district?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_test_user?: boolean
          last_name?: string | null
          mobile?: string | null
          profile_picture_path?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          area?: string | null
          created_at?: string
          date_of_birth?: string | null
          deactivated_at?: string | null
          district?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_test_user?: boolean
          last_name?: string | null
          mobile?: string | null
          profile_picture_path?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_district_fkey"
            columns: ["district"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["district"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: []
      }
      verifications: {
        Row: {
          biometric_consent_id: string | null
          contact_saved_at: string | null
          contact_status: Database["public"]["Enums"]["section_status"]
          created_at: string
          cross_check_at: string | null
          cross_check_note: string | null
          cross_check_status: Database["public"]["Enums"]["cross_check_status"]
          date_of_birth: string | null
          dbs_ai_reasoning: string | null
          dbs_certificate_number: string | null
          dbs_certificate_ref: string | null
          dbs_checked_by: Database["public"]["Enums"]["checked_by"]
          dbs_disclosure_level: string | null
          dbs_expires_at: string | null
          dbs_extracted: Json | null
          dbs_issue_date: string | null
          dbs_outcome: Database["public"]["Enums"]["dbs_outcome"]
          dbs_provider_key: string | null
          dbs_provider_ref: string | null
          dbs_rejection_reason: string | null
          dbs_status: Database["public"]["Enums"]["section_status"]
          dbs_status_at: string | null
          dbs_update_service_checked_by: string | null
          dbs_update_service_consent_at: string | null
          dbs_update_service_last_checked_at: string | null
          dbs_update_service_last_result:
            | Database["public"]["Enums"]["update_service_result"]
            | null
          dbs_update_service_subscribed: boolean | null
          dbs_user_guidance: Json | null
          given_names: string | null
          id: string
          identity_ai_issues: Json | null
          identity_ai_reasoning: string | null
          identity_attempts: number
          identity_checked_at: string | null
          identity_checked_by: Database["public"]["Enums"]["checked_by"]
          identity_document_expiry: string | null
          identity_document_ref: string | null
          identity_evidence_type:
            | Database["public"]["Enums"]["identity_evidence_type"]
            | null
          identity_extracted: Json | null
          identity_provider_key: string | null
          identity_provider_ref: string | null
          identity_rejection_reason: string | null
          identity_selfie_ref: string | null
          identity_status: Database["public"]["Enums"]["section_status"]
          identity_status_at: string | null
          identity_user_guidance: Json | null
          level: Database["public"]["Enums"]["verification_level"]
          level_changed_at: string | null
          nanny_id: string | null
          nationality: string | null
          rtw_check_date: string | null
          rtw_checked_at: string | null
          rtw_checked_by: Database["public"]["Enums"]["checked_by"]
          rtw_document_ref: string | null
          rtw_evidence_type:
            | Database["public"]["Enums"]["rtw_evidence_type"]
            | null
          rtw_expires_at: string | null
          rtw_extracted: Json | null
          rtw_provider_key: string | null
          rtw_provider_ref: string | null
          rtw_rejection_reason: string | null
          rtw_share_code: string | null
          rtw_status: Database["public"]["Enums"]["section_status"]
          rtw_status_at: string | null
          rtw_user_guidance: Json | null
          subject_pseudonym: string | null
          surname: string | null
          suspended_at: string | null
          updated_at: string
        }
        Insert: {
          biometric_consent_id?: string | null
          contact_saved_at?: string | null
          contact_status?: Database["public"]["Enums"]["section_status"]
          created_at?: string
          cross_check_at?: string | null
          cross_check_note?: string | null
          cross_check_status?: Database["public"]["Enums"]["cross_check_status"]
          date_of_birth?: string | null
          dbs_ai_reasoning?: string | null
          dbs_certificate_number?: string | null
          dbs_certificate_ref?: string | null
          dbs_checked_by?: Database["public"]["Enums"]["checked_by"]
          dbs_disclosure_level?: string | null
          dbs_expires_at?: string | null
          dbs_extracted?: Json | null
          dbs_issue_date?: string | null
          dbs_outcome?: Database["public"]["Enums"]["dbs_outcome"]
          dbs_provider_key?: string | null
          dbs_provider_ref?: string | null
          dbs_rejection_reason?: string | null
          dbs_status?: Database["public"]["Enums"]["section_status"]
          dbs_status_at?: string | null
          dbs_update_service_checked_by?: string | null
          dbs_update_service_consent_at?: string | null
          dbs_update_service_last_checked_at?: string | null
          dbs_update_service_last_result?:
            | Database["public"]["Enums"]["update_service_result"]
            | null
          dbs_update_service_subscribed?: boolean | null
          dbs_user_guidance?: Json | null
          given_names?: string | null
          id?: string
          identity_ai_issues?: Json | null
          identity_ai_reasoning?: string | null
          identity_attempts?: number
          identity_checked_at?: string | null
          identity_checked_by?: Database["public"]["Enums"]["checked_by"]
          identity_document_expiry?: string | null
          identity_document_ref?: string | null
          identity_evidence_type?:
            | Database["public"]["Enums"]["identity_evidence_type"]
            | null
          identity_extracted?: Json | null
          identity_provider_key?: string | null
          identity_provider_ref?: string | null
          identity_rejection_reason?: string | null
          identity_selfie_ref?: string | null
          identity_status?: Database["public"]["Enums"]["section_status"]
          identity_status_at?: string | null
          identity_user_guidance?: Json | null
          level?: Database["public"]["Enums"]["verification_level"]
          level_changed_at?: string | null
          nanny_id?: string | null
          nationality?: string | null
          rtw_check_date?: string | null
          rtw_checked_at?: string | null
          rtw_checked_by?: Database["public"]["Enums"]["checked_by"]
          rtw_document_ref?: string | null
          rtw_evidence_type?:
            | Database["public"]["Enums"]["rtw_evidence_type"]
            | null
          rtw_expires_at?: string | null
          rtw_extracted?: Json | null
          rtw_provider_key?: string | null
          rtw_provider_ref?: string | null
          rtw_rejection_reason?: string | null
          rtw_share_code?: string | null
          rtw_status?: Database["public"]["Enums"]["section_status"]
          rtw_status_at?: string | null
          rtw_user_guidance?: Json | null
          subject_pseudonym?: string | null
          surname?: string | null
          suspended_at?: string | null
          updated_at?: string
        }
        Update: {
          biometric_consent_id?: string | null
          contact_saved_at?: string | null
          contact_status?: Database["public"]["Enums"]["section_status"]
          created_at?: string
          cross_check_at?: string | null
          cross_check_note?: string | null
          cross_check_status?: Database["public"]["Enums"]["cross_check_status"]
          date_of_birth?: string | null
          dbs_ai_reasoning?: string | null
          dbs_certificate_number?: string | null
          dbs_certificate_ref?: string | null
          dbs_checked_by?: Database["public"]["Enums"]["checked_by"]
          dbs_disclosure_level?: string | null
          dbs_expires_at?: string | null
          dbs_extracted?: Json | null
          dbs_issue_date?: string | null
          dbs_outcome?: Database["public"]["Enums"]["dbs_outcome"]
          dbs_provider_key?: string | null
          dbs_provider_ref?: string | null
          dbs_rejection_reason?: string | null
          dbs_status?: Database["public"]["Enums"]["section_status"]
          dbs_status_at?: string | null
          dbs_update_service_checked_by?: string | null
          dbs_update_service_consent_at?: string | null
          dbs_update_service_last_checked_at?: string | null
          dbs_update_service_last_result?:
            | Database["public"]["Enums"]["update_service_result"]
            | null
          dbs_update_service_subscribed?: boolean | null
          dbs_user_guidance?: Json | null
          given_names?: string | null
          id?: string
          identity_ai_issues?: Json | null
          identity_ai_reasoning?: string | null
          identity_attempts?: number
          identity_checked_at?: string | null
          identity_checked_by?: Database["public"]["Enums"]["checked_by"]
          identity_document_expiry?: string | null
          identity_document_ref?: string | null
          identity_evidence_type?:
            | Database["public"]["Enums"]["identity_evidence_type"]
            | null
          identity_extracted?: Json | null
          identity_provider_key?: string | null
          identity_provider_ref?: string | null
          identity_rejection_reason?: string | null
          identity_selfie_ref?: string | null
          identity_status?: Database["public"]["Enums"]["section_status"]
          identity_status_at?: string | null
          identity_user_guidance?: Json | null
          level?: Database["public"]["Enums"]["verification_level"]
          level_changed_at?: string | null
          nanny_id?: string | null
          nationality?: string | null
          rtw_check_date?: string | null
          rtw_checked_at?: string | null
          rtw_checked_by?: Database["public"]["Enums"]["checked_by"]
          rtw_document_ref?: string | null
          rtw_evidence_type?:
            | Database["public"]["Enums"]["rtw_evidence_type"]
            | null
          rtw_expires_at?: string | null
          rtw_extracted?: Json | null
          rtw_provider_key?: string | null
          rtw_provider_ref?: string | null
          rtw_rejection_reason?: string | null
          rtw_share_code?: string | null
          rtw_status?: Database["public"]["Enums"]["section_status"]
          rtw_status_at?: string | null
          rtw_user_guidance?: Json | null
          subject_pseudonym?: string | null
          surname?: string | null
          suspended_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "verifications_biometric_consent_id_fkey"
            columns: ["biometric_consent_id"]
            isOneToOne: false
            referencedRelation: "consent_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifications_nanny_id_fkey"
            columns: ["nanny_id"]
            isOneToOne: true
            referencedRelation: "nannies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifications_nanny_id_fkey"
            columns: ["nanny_id"]
            isOneToOne: true
            referencedRelation: "nanny_public"
            referencedColumns: ["nanny_id"]
          },
        ]
      }
      vetting_submissions: {
        Row: {
          checked_at: string | null
          created_at: string
          decided_by: string | null
          evidence_id: string
          evidence_type: string
          id: string
          nanny_id: string | null
          provider_key: string
          provider_ref: string | null
          raw_response: Json | null
          section: Database["public"]["Enums"]["verification_section"]
          status: Database["public"]["Enums"]["vetting_submission_status"]
          subject_pseudonym: string | null
          submitted_at: string
          verification_id: string
        }
        Insert: {
          checked_at?: string | null
          created_at?: string
          decided_by?: string | null
          evidence_id: string
          evidence_type: string
          id?: string
          nanny_id?: string | null
          provider_key: string
          provider_ref?: string | null
          raw_response?: Json | null
          section: Database["public"]["Enums"]["verification_section"]
          status?: Database["public"]["Enums"]["vetting_submission_status"]
          subject_pseudonym?: string | null
          submitted_at?: string
          verification_id: string
        }
        Update: {
          checked_at?: string | null
          created_at?: string
          decided_by?: string | null
          evidence_id?: string
          evidence_type?: string
          id?: string
          nanny_id?: string | null
          provider_key?: string
          provider_ref?: string | null
          raw_response?: Json | null
          section?: Database["public"]["Enums"]["verification_section"]
          status?: Database["public"]["Enums"]["vetting_submission_status"]
          subject_pseudonym?: string | null
          submitted_at?: string
          verification_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vetting_submissions_nanny_id_fkey"
            columns: ["nanny_id"]
            isOneToOne: false
            referencedRelation: "nannies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vetting_submissions_nanny_id_fkey"
            columns: ["nanny_id"]
            isOneToOne: false
            referencedRelation: "nanny_public"
            referencedColumns: ["nanny_id"]
          },
          {
            foreignKeyName: "vetting_submissions_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "verifications"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      booking_events: {
        Row: {
          actor_id: string | null
          actor_kind: Database["public"]["Enums"]["event_actor_kind"] | null
          booking_id: string | null
          from_stage: string | null
          id: string | null
          name: string | null
          on_behalf_of_id: string | null
          props: Json | null
          request_id: string | null
          subject_id: string | null
          subject_kind: string | null
          to_stage: string | null
          ts: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_kind?: Database["public"]["Enums"]["event_actor_kind"] | null
          booking_id?: never
          from_stage?: string | null
          id?: string | null
          name?: string | null
          on_behalf_of_id?: string | null
          props?: Json | null
          request_id?: string | null
          subject_id?: string | null
          subject_kind?: string | null
          to_stage?: string | null
          ts?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_kind?: Database["public"]["Enums"]["event_actor_kind"] | null
          booking_id?: never
          from_stage?: string | null
          id?: string | null
          name?: string | null
          on_behalf_of_id?: string | null
          props?: Json | null
          request_id?: string | null
          subject_id?: string | null
          subject_kind?: string | null
          to_stage?: string | null
          ts?: string | null
        }
        Relationships: []
      }
      child_client_events: {
        Row: {
          actor_id: string | null
          actor_kind: Database["public"]["Enums"]["event_actor_kind"] | null
          child_id: string | null
          id: string | null
          link_id: string | null
          name: string | null
          on_behalf_of_id: string | null
          props: Json | null
          request_id: string | null
          ts: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_kind?: Database["public"]["Enums"]["event_actor_kind"] | null
          child_id?: string | null
          id?: string | null
          link_id?: never
          name?: string | null
          on_behalf_of_id?: string | null
          props?: Json | null
          request_id?: string | null
          ts?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_kind?: Database["public"]["Enums"]["event_actor_kind"] | null
          child_id?: string | null
          id?: string | null
          link_id?: never
          name?: string | null
          on_behalf_of_id?: string | null
          props?: Json | null
          request_id?: string | null
          ts?: string | null
        }
        Relationships: []
      }
      connection_events: {
        Row: {
          actor_id: string | null
          actor_kind: Database["public"]["Enums"]["event_actor_kind"] | null
          connection_id: string | null
          from_stage: string | null
          id: string | null
          name: string | null
          nanny_id: string | null
          on_behalf_of_id: string | null
          position_id: string | null
          props: Json | null
          request_id: string | null
          to_stage: string | null
          transition_id: string | null
          ts: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_kind?: Database["public"]["Enums"]["event_actor_kind"] | null
          connection_id?: never
          from_stage?: string | null
          id?: string | null
          name?: string | null
          nanny_id?: never
          on_behalf_of_id?: string | null
          position_id?: string | null
          props?: Json | null
          request_id?: string | null
          to_stage?: string | null
          transition_id?: string | null
          ts?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_kind?: Database["public"]["Enums"]["event_actor_kind"] | null
          connection_id?: never
          from_stage?: string | null
          id?: string | null
          name?: string | null
          nanny_id?: never
          on_behalf_of_id?: string | null
          position_id?: string | null
          props?: Json | null
          request_id?: string | null
          to_stage?: string | null
          transition_id?: string | null
          ts?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "nanny_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_party_contact: {
        Row: {
          connection_id: string | null
          meeting_at: string | null
          nanny_first_name: string | null
          nanny_id: string | null
          nanny_mobile: string | null
          parent_first_name: string | null
          parent_id: string | null
          parent_mobile: string | null
          position_id: string | null
          stage: Database["public"]["Enums"]["connection_stage"] | null
        }
        Relationships: []
      }
      family_access: {
        Row: {
          access_until: string | null
          has_access: boolean | null
          parent_user_id: string | null
          payment_due_at: string | null
          reason: string | null
          status: Database["public"]["Enums"]["subscription_status"] | null
          trial_ends_at: string | null
        }
        Relationships: []
      }
      nanny_public: {
        Row: {
          area: string | null
          availability: Json | null
          available_from: string | null
          bio: string | null
          certificates: string[] | null
          comfortable_with_pets: boolean | null
          district: string | null
          first_name: string | null
          has_car: boolean | null
          has_driving_licence: boolean | null
          hourly_rate_min_pence: number | null
          is_non_smoker: boolean | null
          languages: string[] | null
          nanny_id: string | null
          profile_picture_object: string | null
          qualification: string | null
          verification_level:
            | Database["public"]["Enums"]["verification_level"]
            | null
          years_experience: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_district_fkey"
            columns: ["district"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["district"]
          },
        ]
      }
      page_visits: {
        Row: {
          created_at: string | null
          id: string | null
          page_path: string | null
          referrer_source: string | null
          user_id: string | null
          visitor_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          page_path?: never
          referrer_source?: never
          user_id?: string | null
          visitor_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          page_path?: never
          referrer_source?: never
          user_id?: string | null
          visitor_id?: string | null
        }
        Relationships: []
      }
      verification_events: {
        Row: {
          actor_id: string | null
          actor_kind: Database["public"]["Enums"]["event_actor_kind"] | null
          from_level: string | null
          from_status: string | null
          id: string | null
          name: string | null
          nanny_id: string | null
          on_behalf_of_id: string | null
          props: Json | null
          provider_key: string | null
          request_id: string | null
          section: string | null
          to_level: string | null
          to_status: string | null
          ts: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_kind?: Database["public"]["Enums"]["event_actor_kind"] | null
          from_level?: never
          from_status?: never
          id?: string | null
          name?: string | null
          nanny_id?: string | null
          on_behalf_of_id?: string | null
          props?: Json | null
          provider_key?: never
          request_id?: string | null
          section?: never
          to_level?: never
          to_status?: never
          ts?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_kind?: Database["public"]["Enums"]["event_actor_kind"] | null
          from_level?: never
          from_status?: never
          id?: string | null
          name?: string | null
          nanny_id?: string | null
          on_behalf_of_id?: string | null
          props?: Json | null
          provider_key?: never
          request_id?: string | null
          section?: never
          to_level?: never
          to_status?: never
          ts?: string | null
        }
        Relationships: []
      }
      verification_status: {
        Row: {
          contact_status: Database["public"]["Enums"]["section_status"] | null
          cross_check_status:
            | Database["public"]["Enums"]["cross_check_status"]
            | null
          dbs_expires_at: string | null
          dbs_issue_date: string | null
          dbs_rejection_reason: string | null
          dbs_status: Database["public"]["Enums"]["section_status"] | null
          dbs_status_at: string | null
          dbs_update_service_subscribed: boolean | null
          dbs_user_guidance: Json | null
          identity_attempts: number | null
          identity_document_expiry: string | null
          identity_evidence_type:
            | Database["public"]["Enums"]["identity_evidence_type"]
            | null
          identity_rejection_reason: string | null
          identity_status: Database["public"]["Enums"]["section_status"] | null
          identity_status_at: string | null
          identity_user_guidance: Json | null
          is_suspended: boolean | null
          level: Database["public"]["Enums"]["verification_level"] | null
          level_changed_at: string | null
          nanny_id: string | null
          rtw_evidence_type:
            | Database["public"]["Enums"]["rtw_evidence_type"]
            | null
          rtw_expires_at: string | null
          rtw_rejection_reason: string | null
          rtw_status: Database["public"]["Enums"]["section_status"] | null
          rtw_status_at: string | null
          rtw_user_guidance: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "verifications_nanny_id_fkey"
            columns: ["nanny_id"]
            isOneToOne: true
            referencedRelation: "nannies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifications_nanny_id_fkey"
            columns: ["nanny_id"]
            isOneToOne: true
            referencedRelation: "nanny_public"
            referencedColumns: ["nanny_id"]
          },
        ]
      }
    }
    Functions: {
      apply_payment_event: {
        Args: {
          p_access_age_years?: number
          p_event_type: string
          p_parent_user_id?: string
          p_payload: Json
          p_provider: string
          p_provider_event_id: string
          p_received_at: string
          p_spine_patch?: Json
        }
        Returns: Json
      }
      apply_vetting_check_result: {
        Args: {
          p_checked_by?: Database["public"]["Enums"]["checked_by"]
          p_expires_at?: string
          p_extracted?: Json
          p_guidance_key?: string
          p_reject_reason?: string
          p_status: string
          p_submission_id: string
        }
        Returns: Json
      }
      auth_user_purge_state: { Args: { p_user_id: string }; Returns: string }
      book_slot: {
        Args: {
          p_actor_role: Database["public"]["Enums"]["actor_role"]
          p_actor_user_id: string
          p_calendar_id: string
          p_displace_to?: string
          p_displacement_cap: number
          p_hold_id?: string
          p_idempotency_key: string
          p_kind: Database["public"]["Enums"]["call_type"]
          p_start_at: string
          p_subject_id: string
          p_subject_type: Database["public"]["Enums"]["booking_subject_type"]
        }
        Returns: Json
      }
      child_has_family_access: {
        Args: { p_child_id: string }
        Returns: boolean
      }
      claim_verification_processing: { Args: never; Returns: string[] }
      collect_erasure_objects: {
        Args: { p_user_id: string }
        Returns: {
          bucket: string
          entity_id: string
          entity_kind: string
          path: string
        }[]
      }
      connect_child_invite: {
        Args: { p_token: string; p_user_id: string }
        Returns: string
      }
      consent_subjects_due_for_renewal: {
        Args: {
          p_before: string
          p_limit?: number
          p_purpose: Database["public"]["Enums"]["consent_purpose"]
        }
        Returns: {
          subject_user_id: string
        }[]
      }
      consume_rate_limit: {
        Args: { p_bucket: string; p_now: string; p_window_seconds: number }
        Returns: {
          count: number
          reset_at: string
        }[]
      }
      create_child_invite: {
        Args: {
          p_child_id: string
          p_direction: Database["public"]["Enums"]["invite_direction"]
          p_token: string
        }
        Returns: string
      }
      create_nanny_account: {
        Args: {
          p_area?: string
          p_district?: string
          p_first_name: string
          p_isolated: boolean
          p_last_name: string
          p_lead_id?: string
          p_mobile?: string
          p_profile?: Json
          p_user_id?: string
        }
        Returns: Json
      }
      create_parent_profile: {
        Args: { p_first_name: string; p_last_name: string; p_mobile: string }
        Returns: undefined
      }
      current_nanny_id: { Args: never; Returns: string }
      current_parent_id: { Args: never; Returns: string }
      end_child_link: {
        Args: {
          p_child_id: string
          p_ended_by: Database["public"]["Enums"]["actor_role"]
          p_reason: string
        }
        Returns: string
      }
      end_placement_if_no_shared_children: {
        Args: { p_placement_id: string }
        Returns: boolean
      }
      ensure_placement: {
        Args: {
          p_child_id: string
          p_nanny_user_id: string
          p_parent_user_id: string
        }
        Returns: string
      }
      erase_account: {
        Args: {
          p_deleted_objects?: Json
          p_request_id: string
          p_user_id: string
        }
        Returns: Json
      }
      expire_verification_section: {
        Args: { p_required?: Json; p_submission_id: string }
        Returns: Json
      }
      family_access_reason: {
        Args: { p_parent_user_id: string }
        Returns: string
      }
      family_has_access: {
        Args: { p_parent_user_id: string }
        Returns: boolean
      }
      get_invite_preview: {
        Args: { p_token: string }
        Returns: {
          child_first_name: string
          direction: Database["public"]["Enums"]["invite_direction"]
          invited_by: string
        }[]
      }
      get_pending_invites_for_recipient: {
        Args: never
        Returns: {
          child_first_name: string
          child_id: string
          created_at: string
          direction: Database["public"]["Enums"]["invite_direction"]
          invite_id: string
        }[]
      }
      increment_chat_cost: {
        Args: {
          p_bloombot_id: string
          p_cached_tokens: number
          p_cost_usd: number
          p_date: string
          p_input_tokens: number
          p_is_proactive: boolean
          p_output_tokens: number
        }
        Returns: {
          bloombot_id: string
          cached_tokens: number
          created_at: string
          date: string
          estimated_cost_usd: number
          input_tokens: number
          output_tokens: number
          proactive_count: number
          turn_count: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "chat_cost_daily"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_active_nanny: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_nanny: { Args: never; Returns: boolean }
      is_parent: { Args: never; Returns: boolean }
      is_privileged_writer: { Args: never; Returns: boolean }
      is_retention_job: { Args: never; Returns: boolean }
      is_safeguarding_retention_job: { Args: never; Returns: boolean }
      lift_nanny_isolation: { Args: never; Returns: boolean }
      lift_nanny_suspension: {
        Args: { p_decided_by: string; p_nanny_id: string; p_reason: string }
        Returns: Json
      }
      nanny_is_visible: { Args: { p_nanny_id: string }; Returns: boolean }
      nanny_leave_child: {
        Args: { p_child_id: string; p_reason: string }
        Returns: string
      }
      nanny_profile_columns: { Args: { p_profile: Json }; Returns: Json }
      nanny_visible: {
        Args: {
          p_is_isolated: boolean
          p_level: Database["public"]["Enums"]["verification_level"]
        }
        Returns: boolean
      }
      open_dfy_access: {
        Args: {
          p_parent_user_id: string
          p_payment_after_start_days: number
          p_placement_id: string
          p_satisfaction_window_days: number
        }
        Returns: {
          access_end_reminder_sent_at: string | null
          access_toggle_reason: string | null
          access_toggle_until: string | null
          access_toggled_at: string | null
          access_toggled_by: string | null
          access_toggled_on: boolean | null
          access_until: string | null
          balance_link_ref: string | null
          balance_pence: number | null
          cancellation_reason:
            | Database["public"]["Enums"]["cancellation_reason"]
            | null
          cancellation_text: string | null
          cancelled_at: string | null
          created_at: string
          current_period_ends_at: string | null
          deposit_link_ref: string | null
          deposit_paid_at: string | null
          deposit_pence: number | null
          deposit_refunded_at: string | null
          dfy_access_opened_at: string | null
          first_week_wages_pence: number | null
          has_used_trial: boolean
          id: string
          instalments_paid: number | null
          instalments_total: number | null
          parent_user_id: string
          past_due_grace_ends_at: string | null
          payment_due_at: string | null
          placement_id: string | null
          plan_shape: Database["public"]["Enums"]["plan_shape"] | null
          price_pence: number | null
          price_preset: string | null
          price_version: string | null
          purchase_path: Database["public"]["Enums"]["purchase_path"] | null
          purchased_at: string | null
          satisfaction_window_ends_at: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          stripe_payment_link_id: string | null
          stripe_subscription_id: string | null
          stripe_subscription_schedule_id: string | null
          trial_ends_at: string | null
          trial_reminder_sent_at: string | null
          trial_started_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "parent_subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      purge_auth_user: { Args: { p_user_id: string }; Returns: undefined }
      purge_scrubbed_user: {
        Args: { p_user_id: string; p_windows: Json }
        Returns: Json
      }
      record_cookie_consent: {
        Args: {
          p_analytics: boolean
          p_choice: Database["public"]["Enums"]["cookie_choice"]
          p_created_at: string
          p_expiry_date: string
          p_id: string
          p_ip?: unknown
          p_marketing: boolean
          p_user_agent?: string
          p_user_id?: string
          p_visitor_id: string
        }
        Returns: string
      }
      record_update_service_check: {
        Args: {
          p_checked_by: string
          p_nanny_id: string
          p_required?: Json
          p_result: Database["public"]["Enums"]["update_service_result"]
          p_subscribed: boolean
        }
        Returns: Json
      }
      record_vetting_decision: {
        Args: {
          p_decided_by?: string
          p_decision: string
          p_expires_at?: string
          p_note?: string
          p_reject_reason?: string
          p_required?: Json
          p_submission_id: string
        }
        Returns: Json
      }
      remove_nanny_from_child: {
        Args: { p_child_id: string; p_reason: string }
        Returns: string
      }
      retention_sweep_class: {
        Args: { p_class: string; p_limit: number; p_spec: Json }
        Returns: Json
      }
      revoke_child_invite: {
        Args: {
          p_invite_id: string
          p_reason: Database["public"]["Enums"]["invite_revoked_reason"]
        }
        Returns: boolean
      }
      save_verification_contact: { Args: never; Returns: boolean }
      scrub_auth_user: { Args: { p_user_id: string }; Returns: undefined }
      set_access_window: {
        Args: { p_access_age_years: number; p_parent_user_id: string }
        Returns: string
      }
      start_family_trial_if_first: {
        Args: {
          p_new_trials_enabled: boolean
          p_parent_user_id: string
          p_trial_days: number
        }
        Returns: {
          access_end_reminder_sent_at: string | null
          access_toggle_reason: string | null
          access_toggle_until: string | null
          access_toggled_at: string | null
          access_toggled_by: string | null
          access_toggled_on: boolean | null
          access_until: string | null
          balance_link_ref: string | null
          balance_pence: number | null
          cancellation_reason:
            | Database["public"]["Enums"]["cancellation_reason"]
            | null
          cancellation_text: string | null
          cancelled_at: string | null
          created_at: string
          current_period_ends_at: string | null
          deposit_link_ref: string | null
          deposit_paid_at: string | null
          deposit_pence: number | null
          deposit_refunded_at: string | null
          dfy_access_opened_at: string | null
          first_week_wages_pence: number | null
          has_used_trial: boolean
          id: string
          instalments_paid: number | null
          instalments_total: number | null
          parent_user_id: string
          past_due_grace_ends_at: string | null
          payment_due_at: string | null
          placement_id: string | null
          plan_shape: Database["public"]["Enums"]["plan_shape"] | null
          price_pence: number | null
          price_preset: string | null
          price_version: string | null
          purchase_path: Database["public"]["Enums"]["purchase_path"] | null
          purchased_at: string | null
          satisfaction_window_ends_at: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          stripe_payment_link_id: string | null
          stripe_subscription_id: string | null
          stripe_subscription_schedule_id: string | null
          trial_ends_at: string | null
          trial_reminder_sent_at: string | null
          trial_started_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "parent_subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      subjects_ready_to_purge: {
        Args: { p_before: string; p_limit?: number }
        Returns: {
          scrubbed_at: string
          subject_user_id: string
        }[]
      }
      submit_verification_evidence: {
        Args: {
          p_columns?: Json
          p_evidence_id: string
          p_evidence_type: string
          p_provider_key: string
          p_section: Database["public"]["Enums"]["verification_section"]
          p_status: Database["public"]["Enums"]["vetting_submission_status"]
        }
        Returns: Json
      }
      sweep_stale_verification_processing: {
        Args: { p_stale_minutes: number }
        Returns: number
      }
      sync_nanny_verification_state: {
        Args: { p_nanny_id: string; p_required: Json }
        Returns: Json
      }
      update_nanny_profile: {
        Args: { p_contact?: Json; p_profile?: Json }
        Returns: boolean
      }
      update_soft_lock: {
        Args: { p_child_id: string; p_locked: boolean }
        Returns: undefined
      }
      upsert_call_mirror: {
        Args: {
          p_about_nanny?: string
          p_call_booking_id?: string
          p_call_requested_at?: string
          p_call_state: Database["public"]["Enums"]["call_state"]
          p_call_type?: Database["public"]["Enums"]["call_type"]
          p_no_answer_count: number
          p_notes?: string
          p_outcome?: Database["public"]["Enums"]["call_outcome"]
          p_position_id: string
          p_version: number
        }
        Returns: number
      }
      upsert_connection: {
        Args: {
          p_columns: Json
          p_expected_version: number
          p_id: string
          p_nanny_id: string
          p_origin: Database["public"]["Enums"]["connection_origin"]
          p_parent_id: string
          p_position_id: string
          p_stage: Database["public"]["Enums"]["connection_stage"]
        }
        Returns: number
      }
      upsert_placement: {
        Args: {
          p_columns: Json
          p_connection_id?: string
          p_expected_version?: number
          p_id: string
          p_nanny_id: string
          p_parent_id: string
          p_position_id: string
          p_source: Database["public"]["Enums"]["placement_source"]
          p_state: Database["public"]["Enums"]["placement_state"]
        }
        Returns: number
      }
      upsert_position: {
        Args: {
          p_columns: Json
          p_details: Json
          p_expected_version: number
          p_id: string
          p_parent_id: string
          p_schedule: Json
          p_source: Database["public"]["Enums"]["position_source"]
          p_stage: Database["public"]["Enums"]["position_stage"]
        }
        Returns: number
      }
      user_has_child_access: { Args: { p_child_id: string }; Returns: boolean }
      verification_sections_verified: {
        Args: {
          p_row: Database["public"]["Tables"]["verifications"]["Row"]
          p_sections: Json
        }
        Returns: boolean
      }
      verification_submission_columns: {
        Args: {
          p_columns: Json
          p_section: Database["public"]["Enums"]["verification_section"]
        }
        Returns: Json
      }
    }
    Enums: {
      actor_role: "parent" | "nanny" | "admin" | "system"
      admin_notification_kind:
        | "call_due"
        | "call_overdue"
        | "commission_call_booked"
        | "onboarding_call_due"
        | "nanny_barred"
        | "contact_message"
        | "cron_failed"
        | "lead_replied"
        | "booking_blocked_over"
        | "booking_displacement_failed"
        | "payment_due"
        | "usage_check_low"
      age_bracket: "0-3" | "3-6" | "6-12" | "12-18" | "18-24" | "24-32"
      attention_reason: "blocked-over" | "displaced" | "manual"
      block_kind: "open" | "blocked"
      booking_cancel_reason:
        | "user-cancelled"
        | "admin-cancelled"
        | "position-closed"
        | "duplicate"
        | "displaced-no-slot"
        | "other"
      booking_status:
        | "held"
        | "booked"
        | "rescheduled"
        | "cancelled"
        | "done"
        | "no-answer"
      booking_subject_type: "position" | "nanny"
      call_outcome:
        | "proceeding"
        | "not-now"
        | "not-proceeding"
        | "no-answer"
        | "cancelled"
      call_state: "awaiting-slot" | "slot-chosen" | "done"
      call_type: "matchmaking" | "onboarding" | "nanny-commission"
      cancellation_reason:
        | "too_expensive"
        | "not_using"
        | "service_issue"
        | "circumstances_changed"
        | "other"
      chat_role: "user" | "assistant" | "system" | "tool"
      chat_trigger_source:
        | "user"
        | "assistant_reply"
        | "proactive_module"
        | "proactive_scheduled"
        | "proactive_template"
        | "proactive_manual"
      checked_by: "ai" | "admin" | "none"
      child_status: "setup" | "active" | "closed"
      close_reason: "parent_closed" | "no_candidates" | "admin_closed"
      connection_origin:
        | "parent_request"
        | "precheck_response"
        | "nanny_application"
        | "admin"
      connection_stage:
        | "REQUEST_SENT"
        | "ACCEPTED"
        | "INTRO_SCHEDULED"
        | "INTRO_COMPLETE"
        | "TRIAL_ARRANGED"
        | "TRIAL_COMPLETE"
        | "OFFERED"
        | "CONFIRMED"
        | "ACTIVE"
        | "NANNY_APPLIED"
        | "REQUEST_EXPIRED"
        | "DECLINED"
        | "REQUEST_CANCELLED"
        | "SCHEDULE_EXPIRED"
        | "INTRO_INCOMPLETE"
        | "AWAITING_RESPONSE"
        | "NOT_HIRED"
        | "NOT_SELECTED"
        | "FINISHED"
        | "CANCELLED_BY_PARENT"
        | "CANCELLED_BY_NANNY"
      consent_purpose:
        | "client-tos"
        | "professional-tos"
        | "privacy-policy"
        | "biometric-notice"
        | "code-of-conduct"
        | "cookie-policy"
        | "disclaimer"
        | "parent-app-consent"
        | "nanny-attestation"
        | "media-consent"
        | "agr14_nanny_child_add"
        | "vaccination-status"
        | "marketing"
        | "cookie"
      contact_category: "refund" | "billing" | "technical" | "general"
      contact_direction: "outbound" | "inbound"
      contact_message_status: "unread" | "replied" | "closed" | "spam"
      contact_method:
        | "call"
        | "sms"
        | "email"
        | "whatsapp"
        | "instagram"
        | "in_person"
        | "manual"
        | "other"
      contact_outcome:
        | "answered"
        | "voicemail"
        | "no_answer"
        | "replied"
        | "booked"
        | "not_interested"
        | "bounced"
        | "pending"
      cookie_choice: "accept_all" | "reject_non_essential" | "custom"
      cross_check_status: "not_started" | "pending" | "passed" | "review"
      dbs_outcome: "unset" | "cleared" | "adverse" | "barred"
      dev_domain: "CL" | "PSE" | "PD" | "LIT" | "NUM" | "UW" | "EAD"
      end_reason:
        | "natural"
        | "nanny_left"
        | "no_longer_needed"
        | "mutual"
        | "child_aged_out"
        | "relocation"
        | "other"
      event_actor_kind: "user" | "admin" | "system" | "visitor" | "anonymous"
      event_source: "server" | "client"
      guarantee_paid_to: "nanny" | "family"
      guarantee_promise: "G1" | "G2" | "G3" | "G4" | "G5" | "nanny-bonus"
      identity_evidence_type:
        | "passport"
        | "uk_driving_licence"
        | "evisa_share_code"
      invite_direction: "nanny_to_parent" | "parent_to_nanny"
      invite_revoked_reason: "manual" | "child_deleted"
      invite_status: "pending" | "connected" | "revoked"
      lead_contact_status:
        | "untouched"
        | "called"
        | "texted"
        | "emailed"
        | "voicemail_left"
        | "no_response"
        | "replied"
        | "in_conversation"
        | "booked"
        | "activated"
        | "dormant"
        | "do_not_contact"
      lead_rtw_status:
        | "citizen"
        | "settled"
        | "visa_with_rtw"
        | "no_rtw"
        | "unknown"
      link_source: "invite" | "placement" | "manual"
      link_state: "active" | "ended"
      meeting_outcome:
        | "hired"
        | "not_hired"
        | "awaiting"
        | "trial"
        | "incomplete"
      memory_priority: "high" | "medium" | "low"
      memory_scope: "account" | "child" | "shared"
      message_channel: "email" | "sms"
      message_status:
        | "queued"
        | "sent"
        | "failed"
        | "bounced"
        | "cancelled"
        | "dry_run"
        | "deduped"
      mover: "user" | "admin" | "system"
      nanny_lead_status:
        | "applied"
        | "ai_generated"
        | "converted"
        | "abandoned"
        | "rejected"
      payment_link_kind: "deposit" | "balance-after-week-1" | "custom"
      placement_source: "connection" | "invite_shell"
      placement_state: "CONFIRMED" | "ACTIVE" | "ENDED"
      plan_shape: "upfront" | "instalments"
      position_source:
        | "results_signup"
        | "in_app"
        | "admin"
        | "invite"
        | "agent"
      position_stage:
        | "DRAFT"
        | "OPEN"
        | "CONNECTING"
        | "ACTIVE"
        | "ENDED"
        | "CLOSED"
      post_context: "adhoc" | "activity" | "assessment"
      post_source: "manual" | "katie" | "system"
      post_status: "pending" | "ready" | "completed"
      post_type:
        | "observation"
        | "activity"
        | "report"
        | "progress"
        | "diary"
        | "insight"
        | "custom"
      precheck_status:
        | "notified"
        | "pending_wave"
        | "viewed"
        | "interested"
        | "declined"
        | "expired"
      prompt_edit_status: "applied" | "rolled_back"
      proposal_kind:
        | "module_change"
        | "schema_change"
        | "prompt_change"
        | "other"
      proposal_status: "open" | "accepted" | "rejected" | "implemented"
      purchase_path: "payment_link" | "self_serve"
      refund_reason:
        | "cooling_off"
        | "service_issue"
        | "goodwill"
        | "duplicate_charge"
        | "other"
        | "guarantee"
      refund_status: "open" | "refunded" | "denied"
      rtw_evidence_type:
        | "british_irish_passport"
        | "share_code"
        | "immigration_document"
      schedule_created_by: "module" | "katie" | "admin"
      schedule_mode: "template" | "ai-minimal" | "ai-full"
      schedule_type: "fixed" | "flexible"
      section_status:
        | "not_started"
        | "pending"
        | "processing"
        | "verified"
        | "review"
        | "rejected"
        | "failed"
        | "expired"
      signup_source: "results" | "cold" | "invite" | "admin"
      subscribe_invite_status: "pending" | "redeemed" | "expired" | "revoked"
      subscription_status:
        | "trial"
        | "active"
        | "past_due"
        | "cancelled"
        | "paid_in_full"
        | "lapsed"
        | "placed"
      summary_period: "daily" | "weekly" | "monthly"
      update_service_result:
        | "not_subscribed"
        | "no_change"
        | "new_information"
        | "check_failed"
      user_role: "parent" | "nanny" | "admin"
      verification_level:
        | "L0_SIGNED_UP"
        | "L1_REGISTERED"
        | "L2_ID_VERIFIED"
        | "L3_PROVISIONALLY_VERIFIED"
        | "L4_FULLY_VERIFIED"
      verification_section:
        | "identity"
        | "dbs"
        | "right_to_work"
        | "contact"
        | "cross_check"
        | "overall"
      vetting_submission_status:
        | "pending"
        | "processing"
        | "needs_admin"
        | "passed"
        | "failed"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      actor_role: ["parent", "nanny", "admin", "system"],
      admin_notification_kind: [
        "call_due",
        "call_overdue",
        "commission_call_booked",
        "onboarding_call_due",
        "nanny_barred",
        "contact_message",
        "cron_failed",
        "lead_replied",
        "booking_blocked_over",
        "booking_displacement_failed",
        "payment_due",
        "usage_check_low",
      ],
      age_bracket: ["0-3", "3-6", "6-12", "12-18", "18-24", "24-32"],
      attention_reason: ["blocked-over", "displaced", "manual"],
      block_kind: ["open", "blocked"],
      booking_cancel_reason: [
        "user-cancelled",
        "admin-cancelled",
        "position-closed",
        "duplicate",
        "displaced-no-slot",
        "other",
      ],
      booking_status: [
        "held",
        "booked",
        "rescheduled",
        "cancelled",
        "done",
        "no-answer",
      ],
      booking_subject_type: ["position", "nanny"],
      call_outcome: [
        "proceeding",
        "not-now",
        "not-proceeding",
        "no-answer",
        "cancelled",
      ],
      call_state: ["awaiting-slot", "slot-chosen", "done"],
      call_type: ["matchmaking", "onboarding", "nanny-commission"],
      cancellation_reason: [
        "too_expensive",
        "not_using",
        "service_issue",
        "circumstances_changed",
        "other",
      ],
      chat_role: ["user", "assistant", "system", "tool"],
      chat_trigger_source: [
        "user",
        "assistant_reply",
        "proactive_module",
        "proactive_scheduled",
        "proactive_template",
        "proactive_manual",
      ],
      checked_by: ["ai", "admin", "none"],
      child_status: ["setup", "active", "closed"],
      close_reason: ["parent_closed", "no_candidates", "admin_closed"],
      connection_origin: [
        "parent_request",
        "precheck_response",
        "nanny_application",
        "admin",
      ],
      connection_stage: [
        "REQUEST_SENT",
        "ACCEPTED",
        "INTRO_SCHEDULED",
        "INTRO_COMPLETE",
        "TRIAL_ARRANGED",
        "TRIAL_COMPLETE",
        "OFFERED",
        "CONFIRMED",
        "ACTIVE",
        "NANNY_APPLIED",
        "REQUEST_EXPIRED",
        "DECLINED",
        "REQUEST_CANCELLED",
        "SCHEDULE_EXPIRED",
        "INTRO_INCOMPLETE",
        "AWAITING_RESPONSE",
        "NOT_HIRED",
        "NOT_SELECTED",
        "FINISHED",
        "CANCELLED_BY_PARENT",
        "CANCELLED_BY_NANNY",
      ],
      consent_purpose: [
        "client-tos",
        "professional-tos",
        "privacy-policy",
        "biometric-notice",
        "code-of-conduct",
        "cookie-policy",
        "disclaimer",
        "parent-app-consent",
        "nanny-attestation",
        "media-consent",
        "agr14_nanny_child_add",
        "vaccination-status",
        "marketing",
        "cookie",
      ],
      contact_category: ["refund", "billing", "technical", "general"],
      contact_direction: ["outbound", "inbound"],
      contact_message_status: ["unread", "replied", "closed", "spam"],
      contact_method: [
        "call",
        "sms",
        "email",
        "whatsapp",
        "instagram",
        "in_person",
        "manual",
        "other",
      ],
      contact_outcome: [
        "answered",
        "voicemail",
        "no_answer",
        "replied",
        "booked",
        "not_interested",
        "bounced",
        "pending",
      ],
      cookie_choice: ["accept_all", "reject_non_essential", "custom"],
      cross_check_status: ["not_started", "pending", "passed", "review"],
      dbs_outcome: ["unset", "cleared", "adverse", "barred"],
      dev_domain: ["CL", "PSE", "PD", "LIT", "NUM", "UW", "EAD"],
      end_reason: [
        "natural",
        "nanny_left",
        "no_longer_needed",
        "mutual",
        "child_aged_out",
        "relocation",
        "other",
      ],
      event_actor_kind: ["user", "admin", "system", "visitor", "anonymous"],
      event_source: ["server", "client"],
      guarantee_paid_to: ["nanny", "family"],
      guarantee_promise: ["G1", "G2", "G3", "G4", "G5", "nanny-bonus"],
      identity_evidence_type: [
        "passport",
        "uk_driving_licence",
        "evisa_share_code",
      ],
      invite_direction: ["nanny_to_parent", "parent_to_nanny"],
      invite_revoked_reason: ["manual", "child_deleted"],
      invite_status: ["pending", "connected", "revoked"],
      lead_contact_status: [
        "untouched",
        "called",
        "texted",
        "emailed",
        "voicemail_left",
        "no_response",
        "replied",
        "in_conversation",
        "booked",
        "activated",
        "dormant",
        "do_not_contact",
      ],
      lead_rtw_status: [
        "citizen",
        "settled",
        "visa_with_rtw",
        "no_rtw",
        "unknown",
      ],
      link_source: ["invite", "placement", "manual"],
      link_state: ["active", "ended"],
      meeting_outcome: [
        "hired",
        "not_hired",
        "awaiting",
        "trial",
        "incomplete",
      ],
      memory_priority: ["high", "medium", "low"],
      memory_scope: ["account", "child", "shared"],
      message_channel: ["email", "sms"],
      message_status: [
        "queued",
        "sent",
        "failed",
        "bounced",
        "cancelled",
        "dry_run",
        "deduped",
      ],
      mover: ["user", "admin", "system"],
      nanny_lead_status: [
        "applied",
        "ai_generated",
        "converted",
        "abandoned",
        "rejected",
      ],
      payment_link_kind: ["deposit", "balance-after-week-1", "custom"],
      placement_source: ["connection", "invite_shell"],
      placement_state: ["CONFIRMED", "ACTIVE", "ENDED"],
      plan_shape: ["upfront", "instalments"],
      position_source: ["results_signup", "in_app", "admin", "invite", "agent"],
      position_stage: [
        "DRAFT",
        "OPEN",
        "CONNECTING",
        "ACTIVE",
        "ENDED",
        "CLOSED",
      ],
      post_context: ["adhoc", "activity", "assessment"],
      post_source: ["manual", "katie", "system"],
      post_status: ["pending", "ready", "completed"],
      post_type: [
        "observation",
        "activity",
        "report",
        "progress",
        "diary",
        "insight",
        "custom",
      ],
      precheck_status: [
        "notified",
        "pending_wave",
        "viewed",
        "interested",
        "declined",
        "expired",
      ],
      prompt_edit_status: ["applied", "rolled_back"],
      proposal_kind: [
        "module_change",
        "schema_change",
        "prompt_change",
        "other",
      ],
      proposal_status: ["open", "accepted", "rejected", "implemented"],
      purchase_path: ["payment_link", "self_serve"],
      refund_reason: [
        "cooling_off",
        "service_issue",
        "goodwill",
        "duplicate_charge",
        "other",
        "guarantee",
      ],
      refund_status: ["open", "refunded", "denied"],
      rtw_evidence_type: [
        "british_irish_passport",
        "share_code",
        "immigration_document",
      ],
      schedule_created_by: ["module", "katie", "admin"],
      schedule_mode: ["template", "ai-minimal", "ai-full"],
      schedule_type: ["fixed", "flexible"],
      section_status: [
        "not_started",
        "pending",
        "processing",
        "verified",
        "review",
        "rejected",
        "failed",
        "expired",
      ],
      signup_source: ["results", "cold", "invite", "admin"],
      subscribe_invite_status: ["pending", "redeemed", "expired", "revoked"],
      subscription_status: [
        "trial",
        "active",
        "past_due",
        "cancelled",
        "paid_in_full",
        "lapsed",
        "placed",
      ],
      summary_period: ["daily", "weekly", "monthly"],
      update_service_result: [
        "not_subscribed",
        "no_change",
        "new_information",
        "check_failed",
      ],
      user_role: ["parent", "nanny", "admin"],
      verification_level: [
        "L0_SIGNED_UP",
        "L1_REGISTERED",
        "L2_ID_VERIFIED",
        "L3_PROVISIONALLY_VERIFIED",
        "L4_FULLY_VERIFIED",
      ],
      verification_section: [
        "identity",
        "dbs",
        "right_to_work",
        "contact",
        "cross_check",
        "overall",
      ],
      vetting_submission_status: [
        "pending",
        "processing",
        "needs_admin",
        "passed",
        "failed",
      ],
    },
  },
} as const

