export type AgencyNotificationTone = "info" | "warning" | "danger";

export type AgencyNotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  path: string;
  tone: AgencyNotificationTone;
};

export type AgencyNotificationsResponse = {
  notifications: AgencyNotificationItem[];
  count: number;
};
