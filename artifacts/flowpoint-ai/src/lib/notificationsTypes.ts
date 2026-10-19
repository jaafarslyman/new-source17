export type NotificationType =
  | 'email_handled'
  | 'email_sent'
  | 'contact_added'
  | 'policy_added'
  | 'category_added'
  | 'urgent_email'
  | 'warning_no_policies'
  | 'warning_no_categories'
  | 'warning_no_staff'
  | 'credits_exceeded';

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  count: number;
  read: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
