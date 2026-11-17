export type Language = 'en' | 'ar';

export type DeviationStatus = 'Pending' | 'Approved' | 'Rejected';

export type UserRole =
  | 'Operator'
  | 'Quality Inspector'
  | 'Production Manager'
  | 'Quality Director'
  | 'System Admin';

export type AuthProvider = 'ActiveDirectory' | 'LocalAdmin';

export type WorkspaceTab =
  | 'field-log'
  | 'dashboard'
  | 'outlook-approvals'
  | 'admin-panel'
  | 'architecture';

export interface AppPermissions {
  canCreateDeviation: boolean;
  canViewAllDeviations: boolean;
  canApproveReject: boolean;
  canExportCsv: boolean;
  canManageAdmin: boolean;
}

export interface ProductionStage {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  assignedManagerEmail: string;
  assignedManagerName: string;
  active: boolean;
}

export interface ChandelierModel {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  collection: string;
  active: boolean;
}

export interface EscalationRecipient {
  id: string;
  name: string;
  nameAr: string;
  email: string;
  department: string;
  minRpnTrigger: number;
  active: boolean;
  addedAt: string;
}

export interface UserAccount {
  id: string;
  username: string;
  displayName: string;
  displayNameAr: string;
  email: string;
  department: string;
  jobTitle?: string;
  role: UserRole;
  permissions: AppPermissions;
  adGroup: string;
  authProvider: AuthProvider;
  active: boolean;
  mustChangePassword?: boolean;
  lastLoginAt?: string;
}

export interface AdDirectoryCandidate {
  username: string;
  displayName: string;
  displayNameAr: string;
  email: string;
  department: string;
  jobTitle: string;
  adGroup: string;
  alreadyProvisioned: boolean;
  source: 'MicrosoftGraph' | 'SyncedAdDirectory';
}

export interface DeviationRecord {
  id: string; // e.g. DEV-2026-0007
  title: string;
  description: string;
  modelCode: string;
  modelName: string;
  stageId: string;
  stageNameEn: string;
  stageNameAr: string;
  quantity: number;
  validUntil?: string; // YYYY-MM-DD (صالح حتى)
  severity: number;
  occurrence: number;
  detection: number;
  rpn: number;
  imageUrl?: string;
  images?: string[];
  imageMeta?: string;
  status: DeviationStatus;
  requesterUsername: string;
  requesterName: string;
  requesterEmail: string;
  requesterDepartment?: string;
  assignedManagerName: string;
  assignedManagerEmail: string;
  escalatedToEmails?: string[];
  managerComment?: string;
  decisionBy?: string;
  decisionAt?: string;
  createdAt: string;
}

export interface EmailMessage {
  id: string;
  type: 'ApprovalRequest' | 'FinalFeedback' | 'QualityEscalation' | 'WelcomeAccess';
  channel: 'Outlook & Teams' | 'Outlook Notification';
  deviationId: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  bodyPreview?: string;
  sentAt: string;
  read: boolean;
  actionTaken?: 'Approved' | 'Rejected';
  managerComment?: string;
  deliveryMethod?: 'SimulatedQueue' | 'GraphAPI' | 'PowerAutomateWebhook';
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorUsername: string;
  actorRole: string;
  action: string;
  target: string;
  details: string;
  ipAddress: string;
}

export interface RpnThresholds {
  lowMax: number;
  mediumMax: number;
  criticalEscalationThreshold: number;
}

export interface FormBuilderRules {
  requirePhotoOnSubmit: boolean;
  requireValidUntilDate: boolean;
  enableBarcodeScanner: boolean;
  defaultValidDays: number;
}

export interface AdSyncConfig {
  tenantDomain: string;
  domainControllerIp: string;
  ldapEndpoint: string;
  baseDn: string;
  bindDn: string;
  hasBindPassword: boolean;
  bindPasswordInput?: string;
  inspectorsGroupDn: string;
  managersGroupDn: string;
  adminsGroupDn: string;
  tenantId: string;
  clientId: string;
  hasClientSecret: boolean;
  clientSecretInput?: string;
  redirectUri: string;
  oauthProtocol: 'OAuth 2.0 / OIDC + SAML 2.0' | 'On-Premises ADFS + LDAP';
  syncIntervalMinutes: number;
  lastSyncAt: string;
  autoProvisionUsers: boolean;
  graphSenderEmail: string;
  powerAutomateWebhookUrl: string;
}

export interface EmailTemplateConfig {
  approvalSubjectTemplate: string;
  feedbackSubjectTemplate: string;
  requireCommentOnReject: boolean;
  ccQualityDirectorAboveRpn: number;
}

export interface SystemConfig {
  companyLogoUrl?: string;
  stages: ProductionStage[];
  models: ChandelierModel[];
  escalationRecipients: EscalationRecipient[];
  rpnThresholds: RpnThresholds;
  formRules: FormBuilderRules;
  adSync: AdSyncConfig;
  emailTemplates: EmailTemplateConfig;
}

export interface BootstrapPayload {
  deviations: DeviationRecord[];
  config: SystemConfig;
  emails: EmailMessage[];
  auditLogs: AuditLogEntry[];
  users: UserAccount[];
  azureSsoEnabled: boolean;
}
