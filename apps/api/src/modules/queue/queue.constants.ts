export const QUEUE_NAMES = {
  NOTIFICATION: 'notification',
  IMAGE: 'image',
  IMPORT: 'import',
  EXPORT: 'export',
  EMAIL: 'email',
  CRON: 'cron',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
