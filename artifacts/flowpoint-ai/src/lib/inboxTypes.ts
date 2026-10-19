export interface InboxEmail {
  Id: string;
  created_at: string;
  'sender name': string;
  'sender email': string;
  category: string | null;
  urgency: string | null;
  response: string | null;
  type: string | null;
  'thread id': string;
  'staff name': string | null;
  'staff email': string | null;
  'staff role': string | null;
  'staff subject': string | null;
  'staff message': string | null;
  /** Subject line of the received email */
  subject: string | null;
  /** Body/content of the received email */
  body: string | null;
  /** Whether this thread is starred */
  star: boolean | null;
  /** Whether this thread is pinned to the top */
  pin: boolean | null;
}

/** One logical thread — built from the latest email in a thread_id group */
export interface EmailThread {
  threadId: string;
  latest: InboxEmail;
  emails: InboxEmail[];
}
