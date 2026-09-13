export type ApplicationName = 'Stripe' | 'Notion' | 'Slack';
export type ApplicationStatus = 'healthy' | 'mismatch' | 'waiting' | 'unavailable';
export type VerificationStatus = 'pass' | 'fail' | 'pending';
export type RecoveryRisk = 'low' | 'medium' | 'high';

export interface ApplicationField { label: string; expected: string; actual: string; matches: boolean; }
export interface ApplicationCardData { name: ApplicationName; status: ApplicationStatus; description: string; fields: ApplicationField[]; lastReadAt: string; }
export interface MismatchData { application: ApplicationName; field: string; expected: string; actual: string; impact: string; }
export interface RecoveryActionData { order: number; title: string; description: string; risk: RecoveryRisk; reversibility: string; status: 'pending' | 'complete' | 'blocked'; }
export interface VerificationCheckData { label: string; detail: string; status: VerificationStatus; }
export interface AuditEventData { timestamp: string; title: string; detail: string; tone: 'neutral' | 'warning' | 'success' | 'danger'; }
