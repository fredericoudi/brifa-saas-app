export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      agencies: {
        Row: {
          id: string;
          name: string;
          slug: string;
          plan: Database["public"]["Enums"]["agency_plan"];
          status: Database["public"]["Enums"]["agency_status"];
          trial_starts_at: string | null;
          trial_ends_at: string | null;
          logo_url: string | null;
          brand_color: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug?: string;
          plan?: Database["public"]["Enums"]["agency_plan"];
          status?: Database["public"]["Enums"]["agency_status"];
          trial_starts_at?: string | null;
          trial_ends_at?: string | null;
          logo_url?: string | null;
          brand_color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          plan?: Database["public"]["Enums"]["agency_plan"];
          status?: Database["public"]["Enums"]["agency_status"];
          trial_starts_at?: string | null;
          trial_ends_at?: string | null;
          logo_url?: string | null;
          brand_color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      plans: {
        Row: {
          id: string;
          code: string;
          name: string;
          price_monthly: number;
          max_users: number | null;
          max_jobs: number | null;
          ai_briefing_enabled: boolean;
          google_drive_enabled: boolean;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          price_monthly?: number;
          max_users?: number | null;
          max_jobs?: number | null;
          ai_briefing_enabled?: boolean;
          google_drive_enabled?: boolean;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          price_monthly?: number;
          max_users?: number | null;
          max_jobs?: number | null;
          ai_briefing_enabled?: boolean;
          google_drive_enabled?: boolean;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agency_subscriptions: {
        Row: {
          id: string;
          agency_id: string;
          plan_id: string;
          status: Database["public"]["Enums"]["subscription_status"];
          billing_cycle: Database["public"]["Enums"]["subscription_billing_cycle"];
          trial_started_at: string | null;
          trial_ends_at: string | null;
          current_period_start: string | null;
          current_period_end: string | null;
          next_billing_date: string | null;
          canceled_at: string | null;
          external_customer_id: string | null;
          external_subscription_id: string | null;
          payment_provider: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          plan_id: string;
          status?: Database["public"]["Enums"]["subscription_status"];
          billing_cycle?: Database["public"]["Enums"]["subscription_billing_cycle"];
          trial_started_at?: string | null;
          trial_ends_at?: string | null;
          current_period_start?: string | null;
          current_period_end?: string | null;
          next_billing_date?: string | null;
          canceled_at?: string | null;
          external_customer_id?: string | null;
          external_subscription_id?: string | null;
          payment_provider?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          plan_id?: string;
          status?: Database["public"]["Enums"]["subscription_status"];
          billing_cycle?: Database["public"]["Enums"]["subscription_billing_cycle"];
          trial_started_at?: string | null;
          trial_ends_at?: string | null;
          current_period_start?: string | null;
          current_period_end?: string | null;
          next_billing_date?: string | null;
          canceled_at?: string | null;
          external_customer_id?: string | null;
          external_subscription_id?: string | null;
          payment_provider?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agency_subscriptions_agency_id_fkey";
            columns: ["agency_id"];
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agency_subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            referencedRelation: "plans";
            referencedColumns: ["id"];
          }
        ];
      };
      agency_integrations: {
        Row: {
          id: string;
          agency_id: string;
          provider: string;
          access_token: string;
          refresh_token: string;
          root_folder_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          provider: string;
          access_token: string;
          refresh_token: string;
          root_folder_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          provider?: string;
          access_token?: string;
          refresh_token?: string;
          root_folder_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agency_integrations_agency_id_fkey";
            columns: ["agency_id"];
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          }
        ];
      };
      users: {
        Row: {
          id: string;
          agency_id: string;
          name: string;
          email: string;
          avatar_url: string | null;
          role: Database["public"]["Enums"]["user_role"];
          agency_role: string;
          platform_role: Database["public"]["Enums"]["platform_role"];
          weekly_capacity_hours: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          agency_id: string;
          name: string;
          email: string;
          avatar_url?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          agency_role?: string;
          platform_role?: Database["public"]["Enums"]["platform_role"];
          weekly_capacity_hours?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          name?: string;
          email?: string;
          avatar_url?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          agency_role?: string;
          platform_role?: Database["public"]["Enums"]["platform_role"];
          weekly_capacity_hours?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "users_agency_id_fkey";
            columns: ["agency_id"];
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          }
        ];
      };
      clients: {
        Row: {
          id: string;
          agency_id: string;
          name: string;
          prefix: string | null;
          company: string | null;
          email: string | null;
          phone: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          name: string;
          prefix?: string | null;
          company?: string | null;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          name?: string;
          prefix?: string | null;
          company?: string | null;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clients_agency_id_fkey";
            columns: ["agency_id"];
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          }
        ];
      };
      jobs: {
        Row: {
          id: string;
          agency_id: string;
          client_id: string;
          title: string;
          client_need: string | null;
          description: string | null;
          status: Database["public"]["Enums"]["job_status"];
          job_code: string | null;
          start_date: string | null;
          start_time: string | null;
          due_date: string | null;
          due_time: string | null;
          drive_folder_id: string | null;
          drive_folder_url: string | null;
          archived_at: string | null;
          archived_by: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          client_id: string;
          title: string;
          client_need?: string | null;
          description?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          job_code?: string | null;
          start_date?: string | null;
          start_time?: string | null;
          due_date?: string | null;
          due_time?: string | null;
          drive_folder_id?: string | null;
          drive_folder_url?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          client_id?: string;
          title?: string;
          client_need?: string | null;
          description?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          job_code?: string | null;
          start_date?: string | null;
          start_time?: string | null;
          due_date?: string | null;
          due_time?: string | null;
          drive_folder_id?: string | null;
          drive_folder_url?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_agency_id_fkey";
            columns: ["agency_id"];
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_archived_by_fkey";
            columns: ["archived_by"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      tasks: {
        Row: {
          id: string;
          agency_id: string;
          job_id: string;
          title: string;
          description: string | null;
          assigned_to: string | null;
          priority: Database["public"]["Enums"]["task_priority"];
          status: Database["public"]["Enums"]["task_status"];
          estimated_hours: number;
          due_date: string | null;
          due_time: string | null;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          job_id: string;
          title: string;
          description?: string | null;
          assigned_to?: string | null;
          priority?: Database["public"]["Enums"]["task_priority"];
          status?: Database["public"]["Enums"]["task_status"];
          estimated_hours?: number;
          due_date?: string | null;
          due_time?: string | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          job_id?: string;
          title?: string;
          description?: string | null;
          assigned_to?: string | null;
          priority?: Database["public"]["Enums"]["task_priority"];
          status?: Database["public"]["Enums"]["task_status"];
          estimated_hours?: number;
          due_date?: string | null;
          due_time?: string | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_agency_id_fkey";
            columns: ["agency_id"];
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey";
            columns: ["assigned_to"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_job_id_fkey";
            columns: ["job_id"];
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          }
        ];
      };
      task_assignees: {
        Row: {
          id: string;
          agency_id: string;
          task_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          task_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          task_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_assignees_agency_id_fkey";
            columns: ["agency_id"];
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignees_task_id_fkey";
            columns: ["task_id"];
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignees_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      job_timeline_events: {
        Row: {
          id: string;
          agency_id: string;
          job_id: string;
          action: string;
          actor_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          job_id: string;
          action: string;
          actor_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          job_id?: string;
          action?: string;
          actor_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_timeline_events_actor_id_fkey";
            columns: ["actor_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_timeline_events_agency_id_fkey";
            columns: ["agency_id"];
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_timeline_events_job_id_fkey";
            columns: ["job_id"];
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          }
        ];
      };
      job_events: {
        Row: {
          id: string;
          job_id: string;
          user_id: string | null;
          event_type: string;
          description: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          user_id?: string | null;
          event_type: string;
          description: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          user_id?: string | null;
          event_type?: string;
          description?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_events_job_id_fkey";
            columns: ["job_id"];
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_events_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      job_views: {
        Row: {
          id: string;
          agency_id: string;
          job_id: string;
          user_id: string;
          viewed_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          job_id: string;
          user_id: string;
          viewed_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          job_id?: string;
          user_id?: string;
          viewed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_views_agency_id_fkey";
            columns: ["agency_id"];
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_views_job_id_fkey";
            columns: ["job_id"];
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_views_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      job_participants_history: {
        Row: {
          id: string;
          agency_id: string;
          job_id: string;
          task_id: string | null;
          user_id: string | null;
          user_name: string;
          task_title: string | null;
          assigned_at: string;
          started_at: string | null;
          ended_at: string | null;
          start_job_status: Database["public"]["Enums"]["job_status"];
          latest_job_status: Database["public"]["Enums"]["job_status"] | null;
          start_task_status: Database["public"]["Enums"]["task_status"] | null;
          latest_task_status: Database["public"]["Enums"]["task_status"] | null;
          end_reason: Database["public"]["Enums"]["job_participation_end_reason"] | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          job_id: string;
          task_id?: string | null;
          user_id?: string | null;
          user_name: string;
          task_title?: string | null;
          assigned_at?: string;
          started_at?: string | null;
          ended_at?: string | null;
          start_job_status: Database["public"]["Enums"]["job_status"];
          latest_job_status?: Database["public"]["Enums"]["job_status"] | null;
          start_task_status?: Database["public"]["Enums"]["task_status"] | null;
          latest_task_status?: Database["public"]["Enums"]["task_status"] | null;
          end_reason?: Database["public"]["Enums"]["job_participation_end_reason"] | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          job_id?: string;
          task_id?: string | null;
          user_id?: string | null;
          user_name?: string;
          task_title?: string | null;
          assigned_at?: string;
          started_at?: string | null;
          ended_at?: string | null;
          start_job_status?: Database["public"]["Enums"]["job_status"];
          latest_job_status?: Database["public"]["Enums"]["job_status"] | null;
          start_task_status?: Database["public"]["Enums"]["task_status"] | null;
          latest_task_status?: Database["public"]["Enums"]["task_status"] | null;
          end_reason?: Database["public"]["Enums"]["job_participation_end_reason"] | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_participants_history_agency_id_fkey";
            columns: ["agency_id"];
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_participants_history_job_id_fkey";
            columns: ["job_id"];
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_participants_history_task_id_fkey";
            columns: ["task_id"];
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_participants_history_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      team_invitations: {
        Row: {
          id: string;
          agency_id: string;
          name: string;
          email: string;
          role: Database["public"]["Enums"]["user_role"];
          agency_role: string;
          invited_by: string;
          created_at: string;
          accepted_at: string | null;
        };
        Insert: {
          id?: string;
          agency_id: string;
          name: string;
          email: string;
          role?: Database["public"]["Enums"]["user_role"];
          agency_role?: string;
          invited_by: string;
          created_at?: string;
          accepted_at?: string | null;
        };
        Update: {
          id?: string;
          agency_id?: string;
          name?: string;
          email?: string;
          role?: Database["public"]["Enums"]["user_role"];
          agency_role?: string;
          invited_by?: string;
          created_at?: string;
          accepted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "team_invitations_agency_id_fkey";
            columns: ["agency_id"];
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_invitations_invited_by_fkey";
            columns: ["invited_by"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      agency_invitations: {
        Row: {
          id: string;
          agency_id: string;
          email: string;
          name: string | null;
          token: string;
          invitation_type: Database["public"]["Enums"]["agency_invitation_type"];
          status: Database["public"]["Enums"]["agency_invitation_status"];
          expires_at: string | null;
          used_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          email: string;
          name?: string | null;
          token: string;
          invitation_type?: Database["public"]["Enums"]["agency_invitation_type"];
          status?: Database["public"]["Enums"]["agency_invitation_status"];
          expires_at?: string | null;
          used_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          email?: string;
          name?: string | null;
          token?: string;
          invitation_type?: Database["public"]["Enums"]["agency_invitation_type"];
          status?: Database["public"]["Enums"]["agency_invitation_status"];
          expires_at?: string | null;
          used_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agency_invitations_agency_id_fkey";
            columns: ["agency_id"];
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agency_invitations_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_agency_id: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      current_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["user_role"] | null;
      };
      current_platform_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["platform_role"] | null;
      };
      default_trial_ends_at: {
        Args: {
          start_at: string;
        };
        Returns: string;
      };
    };
    Enums: {
      agency_plan: "starter" | "growth" | "pro" | "agency";
      agency_status: "active" | "inactive" | "suspended" | "trial";
      agency_invitation_type: "agency_admin_activation" | "team_invitation";
      agency_invitation_status: "pending" | "used" | "expired" | "cancelled";
      job_status: "briefing" | "criacao" | "revisao" | "aprovado" | "finalizado";
      platform_role: "super_admin" | "normal_user";
      job_participation_end_reason: "completed" | "removed" | "finished_job";
      subscription_status: "trial" | "active" | "past_due" | "canceled" | "suspended";
      subscription_billing_cycle: "monthly";
      task_priority: "baixa" | "media" | "alta";
      task_status: "a_fazer" | "em_andamento" | "revisao" | "concluido";
      user_role: "admin" | "member";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Agency = Database["public"]["Tables"]["agencies"]["Row"];
export type Plan = Database["public"]["Tables"]["plans"]["Row"];
export type AgencySubscription = Database["public"]["Tables"]["agency_subscriptions"]["Row"];
export type AgencyIntegration = Database["public"]["Tables"]["agency_integrations"]["Row"];
export type UserProfile = Database["public"]["Tables"]["users"]["Row"];
export type Client = Database["public"]["Tables"]["clients"]["Row"];
export type Job = Database["public"]["Tables"]["jobs"]["Row"];
export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskAssignee = Database["public"]["Tables"]["task_assignees"]["Row"];
export type JobTimelineEvent = Database["public"]["Tables"]["job_timeline_events"]["Row"];
export type JobEvent = Database["public"]["Tables"]["job_events"]["Row"];
export type JobView = Database["public"]["Tables"]["job_views"]["Row"];
export type JobParticipantHistory = Database["public"]["Tables"]["job_participants_history"]["Row"];
export type AgencyInvitation = Database["public"]["Tables"]["agency_invitations"]["Row"];
