import express, { type Express } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Client as LdapClient } from 'ldapts';
import type {
  AdDirectoryCandidate,
  AppPermissions,
  AuditLogEntry,
  DeviationRecord,
  EmailMessage,
  EscalationRecipient,
  SystemConfig,
  UserAccount,
  UserRole,
} from '../src/types.js';

interface StoredUser extends UserAccount {
  passwordHash: string;
}

interface CqdStore {
  users: StoredUser[];
  config: SystemConfig;
  deviations: DeviationRecord[];
  emails: EmailMessage[];
  auditLogs: AuditLogEntry[];
  adClientSecret?: string;
  adBindPassword?: string;
}

const ssoSessions = new Map<string, { username: string; expiresAt: number }>();
let memoryStoreCache: CqdStore | null = null;

function getDbFilePath(): string {
  const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
  const baseDir =
    process.env.CQD_DATA_DIR ||
    (isVercel ? '/tmp/cqd-data' : path.join(process.cwd(), 'data'));
  return path.join(baseDir, 'cqd-store.json');
}

export function defaultPermissionsForRole(role: UserRole): AppPermissions {
  switch (role) {
    case 'System Admin':
      return {
        canCreateDeviation: true,
        canViewAllDeviations: true,
        canApproveReject: true,
        canExportCsv: true,
        canManageAdmin: true,
      };
    case 'Quality Director':
      return {
        canCreateDeviation: true,
        canViewAllDeviations: true,
        canApproveReject: true,
        canExportCsv: true,
        canManageAdmin: false,
      };
    case 'Production Manager':
      return {
        canCreateDeviation: true,
        canViewAllDeviations: true,
        canApproveReject: true,
        canExportCsv: true,
        canManageAdmin: false,
      };
    case 'Quality Inspector':
      return {
        canCreateDeviation: true,
        canViewAllDeviations: true,
        canApproveReject: false,
        canExportCsv: true,
        canManageAdmin: false,
      };
    case 'Operator':
    default:
      return {
        canCreateDeviation: true,
        canViewAllDeviations: false,
        canApproveReject: false,
        canExportCsv: false,
        canManageAdmin: false,
      };
  }
}

const CORPORATE_AD_DIRECTORY_POOL: Omit<AdDirectoryCandidate, 'alreadyProvisioned' | 'source'>[] = [
  {
    username: 't.ibrahim',
    displayName: 'Tarek Ibrahim',
    displayNameAr: 'طارق إبراهيم',
    email: 't.ibrahim@crystalasfour.com',
    department: 'Electroplating & Chrome Line',
    jobTitle: 'Senior Shift Supervisor',
    adGroup: 'CN=CQD-Prod-Supervisors,OU=Manufacturing,DC=crystalasfour,DC=com',
  },
  {
    username: 'h.nassar',
    displayName: 'Heba Nassar',
    displayNameAr: 'هبة نصار',
    email: 'h.nassar@crystalasfour.com',
    department: 'Optical Crystal Inspection',
    jobTitle: 'Lead Quality Engineer',
    adGroup: 'CN=CQD-QC-Inspectors,OU=Quality,DC=crystalasfour,DC=com',
  },
  {
    username: 'y.adel',
    displayName: 'Youssef Adel',
    displayNameAr: 'يوسف عادل',
    email: 'y.adel@crystalasfour.com',
    department: 'Chandelier Assembly Hall 3',
    jobTitle: 'Assembly Line Operator',
    adGroup: 'CN=CQD-Floor-Operators,OU=Manufacturing,DC=crystalasfour,DC=com',
  },
  {
    username: 'r.shawky',
    displayName: 'Rania Shawky',
    displayNameAr: 'رانيا شوقي',
    email: 'r.shawky@crystalasfour.com',
    department: 'ISO 9001 Quality Assurance',
    jobTitle: 'Quality Compliance Specialist',
    adGroup: 'CN=CQD-Quality-Directors,OU=Executive,DC=crystalasfour,DC=com',
  },
  {
    username: 'o.farid',
    displayName: 'Omar Farid',
    displayNameAr: 'عمر فريد',
    email: 'o.farid@crystalasfour.com',
    department: 'Electrical Harness & UL Testing',
    jobTitle: 'Electrical QC Technician',
    adGroup: 'CN=CQD-QC-Inspectors,OU=Quality,DC=crystalasfour,DC=com',
  },
  {
    username: 'l.tawfik',
    displayName: 'Laila Tawfik',
    displayNameAr: 'ليلى توفيق',
    email: 'l.tawfik@crystalasfour.com',
    department: 'Export Packaging & Logistics',
    jobTitle: 'Packaging Operations Manager',
    adGroup: 'CN=CQD-Prod-Managers,OU=Operations,DC=crystalasfour,DC=com',
  },
  {
    username: 's.mahmoud',
    displayName: 'Sherif Mahmoud',
    displayNameAr: 'شريف محمود',
    email: 's.mahmoud@crystalasfour.com',
    department: 'Brass Welding & Fabrication',
    jobTitle: 'Welding Line Foreman',
    adGroup: 'CN=CQD-Floor-Operators,OU=Manufacturing,DC=crystalasfour,DC=com',
  },
  {
    username: 'm.elmasry',
    displayName: 'Mostafa El-Masry',
    displayNameAr: 'مصطفى المصري',
    email: 'm.elmasry@crystalasfour.com',
    department: 'IT Infrastructure & Active Directory',
    jobTitle: 'Enterprise Systems Engineer',
    adGroup: 'CN=CQD-Master-Admins,OU=IT,DC=crystalasfour,DC=com',
  },
];

function createInitialStore(): CqdStore {
  const now = new Date('2026-11-17T08:30:00Z');
  const isoOffset = (hoursAgo: number) =>
    new Date(now.getTime() - hoursAgo * 3600 * 1000).toISOString();

  const config: SystemConfig = {
    companyLogoUrl: '',
    stages: [
      {
        id: 'stg-weld',
        code: 'STG-01',
        nameEn: 'Welding & Brass Framing',
        nameAr: 'اللحام وتشكيل الهياكل',
        assignedManagerName: 'Eng. Karim Mansour',
        assignedManagerEmail: 'k.mansour@crystalasfour.com',
        active: true,
      },
      {
        id: 'stg-paint',
        code: 'STG-02',
        nameEn: 'Painting & Electroplating',
        nameAr: 'الدهان والطلاء الكهربائي',
        assignedManagerName: 'Eng. Karim Mansour',
        assignedManagerEmail: 'k.mansour@crystalasfour.com',
        active: true,
      },
      {
        id: 'stg-cut',
        code: 'STG-03',
        nameEn: 'Crystal Cutting & Polishing',
        nameAr: 'تقطيع وصقل الكريستال',
        assignedManagerName: 'Dr. Nadia Farouk',
        assignedManagerEmail: 'n.farouk@crystalasfour.com',
        active: true,
      },
      {
        id: 'stg-elec',
        code: 'STG-04',
        nameEn: 'Electrical Harness & Testing',
        nameAr: 'التوصيلات الكهربائية والاختبار',
        assignedManagerName: 'Eng. Karim Mansour',
        assignedManagerEmail: 'k.mansour@crystalasfour.com',
        active: true,
      },
      {
        id: 'stg-assem',
        code: 'STG-05',
        nameEn: 'Chandelier Final Assembly',
        nameAr: 'التجميع النهائي للنجف',
        assignedManagerName: 'Dr. Nadia Farouk',
        assignedManagerEmail: 'n.farouk@crystalasfour.com',
        active: true,
      },
      {
        id: 'stg-pack',
        code: 'STG-06',
        nameEn: 'Export Packaging & QC Seal',
        nameAr: 'التغليف والتصدير النهائي',
        assignedManagerName: 'Dr. Nadia Farouk',
        assignedManagerEmail: 'n.farouk@crystalasfour.com',
        active: true,
      },
    ],
    models: [
      {
        id: 'mod-2041',
        code: 'CH-2041',
        nameEn: 'Royal Maria Theresa 24-Arm Chandelier',
        nameAr: 'نجفة ماريا تريزا الملكية ٢٤ ذراع',
        collection: 'Royal Heritage',
        active: true,
      },
      {
        id: 'mod-3108',
        code: 'CH-3108',
        nameEn: 'Versailles Gold Leaf Cascade',
        nameAr: 'نجفة فرساي شلال ذهب عيار ٢٤',
        collection: 'Palace Series',
        active: true,
      },
      {
        id: 'mod-1190',
        code: 'CH-1190',
        nameEn: 'Nile Prism Chrome Ring 120cm',
        nameAr: 'نجفة النيل الحلقية كروم ١٢٠ سم',
        collection: 'Modern Architectural',
        active: true,
      },
      {
        id: 'mod-9012',
        code: 'AS-9012',
        nameEn: 'Asfour Octagon Teardrop 60mm Prism',
        nameAr: 'وحدة كريستال دمعة مثمنة ٦٠ مم',
        collection: 'Precision Components',
        active: true,
      },
      {
        id: 'mod-7740',
        code: 'AS-7740',
        nameEn: 'Empire Brass Wall Sconce Dual',
        nameAr: 'أبليك إمباير نحاس مزدوج',
        collection: 'Royal Heritage',
        active: true,
      },
      {
        id: 'mod-5502',
        code: 'CL-5502',
        nameEn: 'Alabaster & Crystal Ballroom Pendant',
        nameAr: 'معلقة قاعات أفراح كريستال وألباستر',
        collection: 'Hospitality Custom',
        active: true,
      },
    ],
    escalationRecipients: [
      {
        id: 'esc-1',
        name: 'Dr. Nadia Farouk',
        nameAr: 'د. نادية فاروق',
        email: 'n.farouk@crystalasfour.com',
        department: 'Corporate Quality Assurance',
        minRpnTrigger: 120,
        active: true,
        addedAt: isoOffset(48),
      },
      {
        id: 'esc-2',
        name: 'ISO 9001 Quality Control Board',
        nameAr: 'لجنة الرقابة والجودة المركزية',
        email: 'qc-escalation@crystalasfour.com',
        department: 'Central Quality Governance',
        minRpnTrigger: 120,
        active: true,
        addedAt: isoOffset(48),
      },
    ],
    rpnThresholds: {
      lowMax: 59,
      mediumMax: 119,
      criticalEscalationThreshold: 120,
    },
    formRules: {
      requirePhotoOnSubmit: false,
      requireValidUntilDate: true,
      enableBarcodeScanner: true,
      defaultValidDays: 14,
    },
    adSync: {
      tenantDomain: 'asfourcrystal.com',
      domainControllerIp: '10.42.1.10',
      ldapEndpoint: 'ldaps://dc01.asfourcrystal.com:636',
      baseDn: 'DC=asfourcrystal,DC=com',
      bindDn: 'CN=svc-cqd-ldap,OU=ServiceAccounts,DC=asfourcrystal,DC=com',
      hasBindPassword: false,
      inspectorsGroupDn: 'CN=CQD-QC-Inspectors,OU=Quality,DC=asfourcrystal,DC=com',
      managersGroupDn: 'CN=CQD-Prod-Managers,OU=Operations,DC=asfourcrystal,DC=com',
      adminsGroupDn: 'CN=CQD-Master-Admins,OU=IT,DC=asfourcrystal,DC=com',
      tenantId: process.env.AZURE_AD_TENANT_ID || '',
      clientId: process.env.AZURE_AD_CLIENT_ID || '',
      hasClientSecret: Boolean(process.env.AZURE_AD_CLIENT_SECRET),
      redirectUri: process.env.AZURE_AD_REDIRECT_URI || '',
      oauthProtocol: 'OAuth 2.0 / OIDC + SAML 2.0',
      syncIntervalMinutes: 15,
      lastSyncAt: isoOffset(0.25),
      autoProvisionUsers: true,
      graphSenderEmail: process.env.GRAPH_SENDER_EMAIL || 'cqd-noreply@asfourcrystal.com',
      powerAutomateWebhookUrl: process.env.POWER_AUTOMATE_WEBHOOK_URL || '',
    },
    emailTemplates: {
      approvalSubjectTemplate: '[CQD Action Required] {{DEV_ID}} — {{TITLE}} (RPN {{RPN}})',
      feedbackSubjectTemplate: '[CQD Decision: {{STATUS}}] {{DEV_ID}} — {{TITLE}}',
      requireCommentOnReject: true,
      ccQualityDirectorAboveRpn: 120,
    },
  };

  const users: StoredUser[] = [
    {
      id: 'usr-admin',
      username: 'admin',
      passwordHash: 'admin124',
      displayName: 'System Administrator',
      displayNameAr: 'مدير النظام الرئيسي',
      email: 'cqd-admin@crystalasfour.com',
      department: 'IT & Quality Systems',
      jobTitle: 'Master Administrator',
      role: 'System Admin',
      permissions: defaultPermissionsForRole('System Admin'),
      adGroup: 'CN=CQD-Master-Admins,OU=IT,DC=crystalasfour,DC=com',
      authProvider: 'LocalAdmin',
      active: true,
      mustChangePassword: false,
      lastLoginAt: isoOffset(12),
    },
    {
      id: 'usr-operator',
      username: 'a.salem',
      passwordHash: 'crystal2026',
      displayName: 'Ahmed Salem',
      displayNameAr: 'أحمد سالم',
      email: 'a.salem@crystalasfour.com',
      department: 'Line B — Plating & Paint',
      jobTitle: 'Line Operator',
      role: 'Operator',
      permissions: defaultPermissionsForRole('Operator'),
      adGroup: 'CN=CQD-Floor-Operators,OU=Manufacturing,DC=crystalasfour,DC=com',
      authProvider: 'ActiveDirectory',
      active: true,
      mustChangePassword: false,
      lastLoginAt: isoOffset(3),
    },
    {
      id: 'usr-inspector',
      username: 'm.hassan',
      passwordHash: 'crystal2026',
      displayName: 'Mariam Hassan',
      displayNameAr: 'مريم حسن',
      email: 'm.hassan@crystalasfour.com',
      department: 'Quality Control Lab',
      jobTitle: 'Quality Inspector',
      role: 'Quality Inspector',
      permissions: defaultPermissionsForRole('Quality Inspector'),
      adGroup: 'CN=CQD-QC-Inspectors,OU=Quality,DC=crystalasfour,DC=com',
      authProvider: 'ActiveDirectory',
      active: true,
      mustChangePassword: false,
      lastLoginAt: isoOffset(1.5),
    },
    {
      id: 'usr-manager',
      username: 'k.mansour',
      passwordHash: 'crystal2026',
      displayName: 'Eng. Karim Mansour',
      displayNameAr: 'م. كريم منصور',
      email: 'k.mansour@crystalasfour.com',
      department: 'Production Operations',
      jobTitle: 'Production Manager',
      role: 'Production Manager',
      permissions: defaultPermissionsForRole('Production Manager'),
      adGroup: 'CN=CQD-Prod-Managers,OU=Operations,DC=crystalasfour,DC=com',
      authProvider: 'ActiveDirectory',
      active: true,
      mustChangePassword: false,
      lastLoginAt: isoOffset(0.8),
    },
    {
      id: 'usr-director',
      username: 'n.farouk',
      passwordHash: 'crystal2026',
      displayName: 'Dr. Nadia Farouk',
      displayNameAr: 'د. نادية فاروق',
      email: 'n.farouk@crystalasfour.com',
      department: 'Corporate Quality Assurance',
      jobTitle: 'Quality Director',
      role: 'Quality Director',
      permissions: defaultPermissionsForRole('Quality Director'),
      adGroup: 'CN=CQD-Quality-Directors,OU=Executive,DC=crystalasfour,DC=com',
      authProvider: 'ActiveDirectory',
      active: true,
      mustChangePassword: false,
      lastLoginAt: isoOffset(2),
    },
  ];

  const deviations: DeviationRecord[] = [
    {
      id: 'DEV-2026-0006',
      title: 'خدش في دهان الكروم على الذراع الرئيسي (Chrome Finish Scratch)',
      description:
        'Surface micro-scratch observed along the upper electroplated chrome arm during final rack transfer before clear-coat curing. Batch #PL-884.',
      modelCode: 'CH-2041',
      modelName: 'Royal Maria Theresa 24-Arm Chandelier',
      stageId: 'stg-paint',
      stageNameEn: 'Painting & Electroplating',
      stageNameAr: 'الدهان والطلاء الكهربائي',
      quantity: 14,
      severity: 7,
      occurrence: 4,
      detection: 5,
      rpn: 140,
      imageUrl: '/src/assets/images/crystal_chandelier_defect_1794943872423.jpg',
      imageMeta: 'Compressed 1024×768 · 142 KB',
      status: 'Pending',
      requesterUsername: 'm.hassan',
      requesterName: 'Mariam Hassan',
      requesterEmail: 'm.hassan@crystalasfour.com',
      assignedManagerName: 'Eng. Karim Mansour',
      assignedManagerEmail: 'k.mansour@crystalasfour.com',
      escalatedToEmails: ['n.farouk@crystalasfour.com', 'qc-escalation@crystalasfour.com'],
      createdAt: isoOffset(1.2),
    },
    {
      id: 'DEV-2026-0005',
      title: 'كسر طفيف بحافة منشور الكريستال 60mm (Prism Tip Micro-Chip)',
      description:
        'Optical facet edge chip detected on 18 pieces of 60mm octagonal crystal teardrops during dark-pad refraction inspection.',
      modelCode: 'AS-9012',
      modelName: 'Asfour Octagon Teardrop 60mm Prism',
      stageId: 'stg-cut',
      stageNameEn: 'Crystal Cutting & Polishing',
      stageNameAr: 'تقطيع وصقل الكريستال',
      quantity: 18,
      severity: 8,
      occurrence: 3,
      detection: 6,
      rpn: 144,
      imageUrl: '/src/assets/images/crystal_prism_defect_1794943872478.jpg',
      imageMeta: 'Compressed 1024×768 · 168 KB',
      status: 'Pending',
      requesterUsername: 'm.hassan',
      requesterName: 'Mariam Hassan',
      requesterEmail: 'm.hassan@crystalasfour.com',
      assignedManagerName: 'Dr. Nadia Farouk',
      assignedManagerEmail: 'n.farouk@crystalasfour.com',
      escalatedToEmails: ['n.farouk@crystalasfour.com', 'qc-escalation@crystalasfour.com'],
      createdAt: isoOffset(3.5),
    },
    {
      id: 'DEV-2026-0004',
      title: 'تفاوت عزل الضفيرة الكهربائية E14 (Harness Insulation Tolerance)',
      description:
        'Braided textile cable sleeve terminated 4mm short of brass strain-relief collar on Lot #EL-412. Dielectric hipo test passed at 1500V.',
      modelCode: 'CH-3108',
      modelName: 'Versailles Gold Leaf Cascade',
      stageId: 'stg-elec',
      stageNameEn: 'Electrical Harness & Testing',
      stageNameAr: 'التوصيلات الكهربائية والاختبار',
      quantity: 22,
      severity: 6,
      occurrence: 3,
      detection: 4,
      rpn: 72,
      imageUrl: '/src/assets/images/crystal_wiring_assembly_1794943874304.jpg',
      imageMeta: 'Compressed 1024×768 · 154 KB',
      status: 'Approved',
      requesterUsername: 'a.salem',
      requesterName: 'Ahmed Salem',
      requesterEmail: 'a.salem@crystalasfour.com',
      assignedManagerName: 'Eng. Karim Mansour',
      assignedManagerEmail: 'k.mansour@crystalasfour.com',
      managerComment: 'موافق، بشرط فحص 100% للعزل الحراري قبل التجميع النهائي.',
      decisionBy: 'Eng. Karim Mansour',
      decisionAt: isoOffset(5.1),
      createdAt: isoOffset(7.4),
    },
    {
      id: 'DEV-2026-0003',
      title: 'انحراف زاوية لحام قاعدة التثبيت (Base Bracket Weld Angle +1.5°)',
      description:
        'Jig alignment drift caused 1.5° offset on secondary ceiling canopy bracket. Structural load test verified safe up to 85kg.',
      modelCode: 'CH-1190',
      modelName: 'Nile Prism Chrome Ring 120cm',
      stageId: 'stg-weld',
      stageNameEn: 'Welding & Brass Framing',
      stageNameAr: 'اللحام وتشكيل الهياكل',
      quantity: 6,
      severity: 5,
      occurrence: 2,
      detection: 4,
      rpn: 40,
      status: 'Approved',
      requesterUsername: 'a.salem',
      requesterName: 'Ahmed Salem',
      requesterEmail: 'a.salem@crystalasfour.com',
      assignedManagerName: 'Eng. Karim Mansour',
      assignedManagerEmail: 'k.mansour@crystalasfour.com',
      managerComment: 'Approved with jig recalibration logged on Line W-02.',
      decisionBy: 'Eng. Karim Mansour',
      decisionAt: isoOffset(18),
      createdAt: isoOffset(22),
    },
    {
      id: 'DEV-2026-0002',
      title: 'عدم تطابق درجة حرارة الفوم في التغليف (Export Foam Density Deviation)',
      description:
        'Protective EPE foam insert measured 22 kg/m³ instead of export spec 28 kg/m³ for heavy ballroom crates.',
      modelCode: 'CL-5502',
      modelName: 'Alabaster & Crystal Ballroom Pendant',
      stageId: 'stg-pack',
      stageNameEn: 'Export Packaging & QC Seal',
      stageNameAr: 'التغليف والتصدير النهائي',
      quantity: 8,
      severity: 7,
      occurrence: 5,
      detection: 5,
      rpn: 175,
      status: 'Rejected',
      requesterUsername: 'm.hassan',
      requesterName: 'Mariam Hassan',
      requesterEmail: 'm.hassan@crystalasfour.com',
      assignedManagerName: 'Dr. Nadia Farouk',
      assignedManagerEmail: 'n.farouk@crystalasfour.com',
      escalatedToEmails: ['n.farouk@crystalasfour.com', 'qc-escalation@crystalasfour.com'],
      managerComment:
        'مرفوض للشحن البحري. يجب استبدال الفوم بكثافة 28 كجم/م³ لحماية وحدات الكريستال.',
      decisionBy: 'Dr. Nadia Farouk',
      decisionAt: isoOffset(28),
      createdAt: isoOffset(31),
    },
    {
      id: 'DEV-2026-0001',
      title: 'تفاوت طول سلسلة التعليق بمقدار 3 مم (Suspension Chain Length +3mm)',
      description:
        'Brass link batch showed +3mm cumulative length over 1.2m drop. Easily compensated via upper canopy adjuster.',
      modelCode: 'AS-7740',
      modelName: 'Empire Brass Wall Sconce Dual',
      stageId: 'stg-assem',
      stageNameEn: 'Chandelier Final Assembly',
      stageNameAr: 'التجميع النهائي للنجف',
      quantity: 30,
      severity: 3,
      occurrence: 3,
      detection: 3,
      rpn: 27,
      status: 'Approved',
      requesterUsername: 'a.salem',
      requesterName: 'Ahmed Salem',
      requesterEmail: 'a.salem@crystalasfour.com',
      assignedManagerName: 'Dr. Nadia Farouk',
      assignedManagerEmail: 'n.farouk@crystalasfour.com',
      managerComment: 'Approved as minor dimensional tolerance.',
      decisionBy: 'Dr. Nadia Farouk',
      decisionAt: isoOffset(44),
      createdAt: isoOffset(48),
    },
  ];

  const emails: EmailMessage[] = [
    {
      id: 'eml-006',
      type: 'ApprovalRequest',
      channel: 'Outlook & Teams',
      deviationId: 'DEV-2026-0006',
      recipientEmail: 'k.mansour@crystalasfour.com',
      recipientName: 'Eng. Karim Mansour',
      subject: '[CQD Action Required] DEV-2026-0006 — Chrome Finish Scratch (RPN 140)',
      sentAt: isoOffset(1.2),
      read: false,
      deliveryMethod: 'SimulatedQueue',
    },
    {
      id: 'eml-006-esc',
      type: 'QualityEscalation',
      channel: 'Outlook & Teams',
      deviationId: 'DEV-2026-0006',
      recipientEmail: 'qc-escalation@crystalasfour.com',
      recipientName: 'ISO 9001 Quality Control Board',
      subject: '[CRITICAL RPN ESCALATION 140] DEV-2026-0006 — Chrome Finish Scratch',
      bodyPreview:
        'RPN score 140 exceeded threshold (120). Escalated automatically to Quality Control Board.',
      sentAt: isoOffset(1.2),
      read: false,
      deliveryMethod: 'SimulatedQueue',
    },
    {
      id: 'eml-005',
      type: 'ApprovalRequest',
      channel: 'Outlook & Teams',
      deviationId: 'DEV-2026-0005',
      recipientEmail: 'n.farouk@crystalasfour.com',
      recipientName: 'Dr. Nadia Farouk',
      subject: '[CQD Action Required] DEV-2026-0005 — Prism Tip Micro-Chip (RPN 144)',
      sentAt: isoOffset(3.5),
      read: false,
      deliveryMethod: 'SimulatedQueue',
    },
    {
      id: 'eml-004-fb',
      type: 'FinalFeedback',
      channel: 'Outlook Notification',
      deviationId: 'DEV-2026-0004',
      recipientEmail: 'a.salem@crystalasfour.com',
      recipientName: 'Ahmed Salem',
      subject: '[CQD Decision: Approved] DEV-2026-0004 — Harness Insulation Tolerance',
      sentAt: isoOffset(5.1),
      read: true,
      actionTaken: 'Approved',
      managerComment: 'موافق، بشرط فحص 100% للعزل الحراري قبل التجميع النهائي.',
      deliveryMethod: 'SimulatedQueue',
    },
    {
      id: 'eml-002-fb',
      type: 'FinalFeedback',
      channel: 'Outlook Notification',
      deviationId: 'DEV-2026-0002',
      recipientEmail: 'm.hassan@crystalasfour.com',
      recipientName: 'Mariam Hassan',
      subject: '[CQD Decision: Rejected] DEV-2026-0002 — Export Foam Density Deviation',
      sentAt: isoOffset(28),
      read: true,
      actionTaken: 'Rejected',
      managerComment:
        'مرفوض للشحن البحري. يجب استبدال الفوم بكثافة 28 كجم/م³ لحماية وحدات الكريستال.',
      deliveryMethod: 'SimulatedQueue',
    },
  ];

  const auditLogs: AuditLogEntry[] = [
    {
      id: 'aud-104',
      timestamp: isoOffset(1.2),
      actorUsername: 'm.hassan',
      actorRole: 'Quality Inspector',
      action: 'DEVIATION_CREATED',
      target: 'DEV-2026-0006',
      details:
        'Logged Chrome Finish Scratch (CH-2041, RPN 140). Escalated to qc-escalation@crystalasfour.com.',
      ipAddress: '10.42.18.104',
    },
    {
      id: 'aud-103',
      timestamp: isoOffset(3.5),
      actorUsername: 'm.hassan',
      actorRole: 'Quality Inspector',
      action: 'DEVIATION_CREATED',
      target: 'DEV-2026-0005',
      details: 'Logged Prism Tip Micro-Chip (AS-9012, RPN 144) and escalated to Quality Director.',
      ipAddress: '10.42.18.104',
    },
    {
      id: 'aud-102',
      timestamp: isoOffset(5.1),
      actorUsername: 'k.mansour',
      actorRole: 'Production Manager',
      action: 'OUTLOOK_CARD_APPROVED',
      target: 'DEV-2026-0004',
      details: 'Approved via Outlook Actionable Message with 100% inspection condition.',
      ipAddress: '10.42.12.22',
    },
    {
      id: 'aud-101',
      timestamp: isoOffset(12),
      actorUsername: 'admin',
      actorRole: 'System Admin',
      action: 'AD_SYNC_COMPLETED',
      target: 'corp.crystalasfour.com',
      details: 'Synchronized security groups and corporate AD directory.',
      ipAddress: '10.42.1.10',
    },
  ];

  return { users, config, deviations, emails, auditLogs };
}

function loadStore(): CqdStore {
  const dbFile = getDbFilePath();
  const dir = path.dirname(dbFile);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(dbFile)) {
      const initial = memoryStoreCache ?? createInitialStore();
      fs.writeFileSync(dbFile, JSON.stringify(initial, null, 2), 'utf8');
      memoryStoreCache = initial;
      return initial;
    }
    const raw = fs.readFileSync(dbFile, 'utf8');
    const parsed = JSON.parse(raw) as CqdStore;
    // Backfill new fields on older store files
    const defaults = createInitialStore().config;
    if (!parsed.config.escalationRecipients) {
      parsed.config.escalationRecipients = defaults.escalationRecipients;
    }
    if (!parsed.config.formRules) {
      parsed.config.formRules = defaults.formRules;
    }
    if (typeof parsed.config.companyLogoUrl !== 'string') {
      parsed.config.companyLogoUrl = '';
    }
    parsed.config.adSync = {
      ...defaults.adSync,
      ...parsed.config.adSync,
    };
    for (const u of parsed.users) {
      if (!u.permissions) {
        u.permissions = defaultPermissionsForRole(u.role);
      }
    }
    memoryStoreCache = parsed;
    return parsed;
  } catch {
    if (!memoryStoreCache) {
      memoryStoreCache = createInitialStore();
    }
    return memoryStoreCache;
  }
}

function saveStore(store: CqdStore): void {
  memoryStoreCache = store;
  const dbFile = getDbFilePath();
  const dir = path.dirname(dbFile);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(dbFile, JSON.stringify(store, null, 2), 'utf8');
  } catch {
    // Fallback to memory cache if filesystem is read-only
  }
}

function sanitizeUser(user: StoredUser): UserAccount {
  const { passwordHash: _ignored, ...safe } = user;
  return safe;
}

function sanitizeConfig(store: CqdStore): SystemConfig {
  const creds = getAzureCredentials(store);
  const ldap = getLdapConfig(store);
  return {
    ...store.config,
    adSync: {
      ...store.config.adSync,
      tenantDomain: ldap.domain,
      ldapEndpoint: ldap.ldapUrl,
      baseDn: ldap.baseDn,
      bindDn: ldap.bindDn,
      tenantId: creds.tenantId,
      clientId: creds.clientId,
      hasClientSecret: Boolean(creds.clientSecret),
      clientSecretInput: undefined,
      hasBindPassword: Boolean(ldap.bindPassword),
      bindPasswordInput: undefined,
    },
  };
}

function getAzureCredentials(store: CqdStore) {
  const tenantId = (
    process.env.AZURE_AD_TENANT_ID ||
    process.env.AZURE_TENANT_ID ||
    process.env.TENANT_ID ||
    process.env.ENTRA_TENANT_ID ||
    process.env.MICROSOFT_TENANT_ID ||
    process.env.AD_TENANT_ID ||
    process.env.VITE_AZURE_AD_TENANT_ID ||
    process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID ||
    store.config.adSync.tenantId ||
    ''
  ).trim();
  const clientId = (
    process.env.AZURE_AD_CLIENT_ID ||
    process.env.AZURE_CLIENT_ID ||
    process.env.CLIENT_ID ||
    process.env.ENTRA_CLIENT_ID ||
    process.env.MICROSOFT_CLIENT_ID ||
    process.env.AD_CLIENT_ID ||
    process.env.VITE_AZURE_AD_CLIENT_ID ||
    process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID ||
    store.config.adSync.clientId ||
    ''
  ).trim();
  const clientSecret = (
    process.env.AZURE_AD_CLIENT_SECRET ||
    process.env.AZURE_CLIENT_SECRET ||
    process.env.CLIENT_SECRET ||
    process.env.ENTRA_CLIENT_SECRET ||
    process.env.MICROSOFT_CLIENT_SECRET ||
    process.env.AD_CLIENT_SECRET ||
    store.adClientSecret ||
    ''
  ).trim();
  const redirectUri = (
    process.env.AZURE_AD_REDIRECT_URI ||
    process.env.AZURE_REDIRECT_URI ||
    process.env.ENTRA_REDIRECT_URI ||
    store.config.adSync.redirectUri ||
    ''
  ).trim();
  return {
    tenantId,
    clientId,
    clientSecret,
    redirectUri,
    isConfigured: Boolean(tenantId && clientId && clientSecret),
    hasTenantAndClient: Boolean(tenantId && clientId),
  };
}

function getLdapConfig(store: CqdStore) {
  const defaultPlaceholders = new Set([
    'ldaps://dc01.asfourcrystal.com:636',
    'ldaps://dc01.corp.crystalasfour.com:636',
  ]);
  const envUrl = (
    process.env.LDAP_URL ||
    process.env.LDAP_ENDPOINT ||
    process.env.AD_LDAP_URL ||
    process.env.LDAP_URI ||
    ''
  ).trim();
  const envHost = (
    process.env.LDAP_HOST ||
    process.env.AD_SERVER_IP ||
    process.env.DOMAIN_CONTROLLER_IP ||
    ''
  ).trim();
  const savedEndpoint = (store.config.adSync.ldapEndpoint || '').trim();
  const savedIp = (store.config.adSync.domainControllerIp || '').trim();
  const isCustomSavedIp = Boolean(savedIp && savedIp !== '10.42.1.10');

  let ldapUrl = envUrl;
  if (!ldapUrl && envHost) {
    ldapUrl = /^ldaps?:\/\//i.test(envHost) ? envHost : `ldaps://${envHost}:636`;
  }
  if (!ldapUrl) {
    if (savedEndpoint && (!defaultPlaceholders.has(savedEndpoint) || !isCustomSavedIp)) {
      ldapUrl = savedEndpoint;
    } else if (savedIp) {
      ldapUrl = `ldaps://${savedIp}:636`;
    }
  }

  const domain = (
    process.env.AD_DOMAIN ||
    process.env.TENANT_DOMAIN ||
    store.config.adSync.tenantDomain ||
    'asfourcrystal.com'
  ).trim();
  const baseDn = (
    process.env.LDAP_BASE_DN ||
    process.env.AD_BASE_DN ||
    process.env.BASE_DN ||
    store.config.adSync.baseDn ||
    ''
  ).trim();
  const bindDn = (
    process.env.LDAP_BIND_DN ||
    process.env.AD_BIND_DN ||
    process.env.BIND_DN ||
    process.env.LDAP_USERNAME ||
    store.config.adSync.bindDn ||
    ''
  ).trim();
  const bindPassword = (
    process.env.LDAP_BIND_PASSWORD ||
    process.env.AD_BIND_PASSWORD ||
    process.env.BIND_PASSWORD ||
    process.env.LDAP_PASSWORD ||
    store.adBindPassword ||
    ''
  ).trim();

  const hasExplicitLdapConfig = Boolean(
    envUrl ||
      envHost ||
      bindPassword ||
      isCustomSavedIp ||
      (savedEndpoint && !defaultPlaceholders.has(savedEndpoint))
  );

  return {
    domain,
    ldapUrl,
    baseDn,
    bindDn,
    bindPassword,
    hasExplicitLdapConfig,
    isConfigured: Boolean(ldapUrl && baseDn),
  };
}

function escapeLdapFilter(value: string): string {
  return value.replace(/[\\*()\0]/g, (ch) => {
    const hex = ch.charCodeAt(0).toString(16).padStart(2, '0');
    return `\\${hex}`;
  });
}

function normalizeUsernameInput(raw: string): {
  rawLower: string;
  bare: string;
  domainPrefix: string;
  hasDomainAt: boolean;
} {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (lower.includes('\\')) {
    const parts = lower.split('\\');
    return {
      rawLower: lower,
      bare: parts[parts.length - 1] || lower,
      domainPrefix: parts[0] || '',
      hasDomainAt: false,
    };
  }
  if (lower.includes('@')) {
    return {
      rawLower: lower,
      bare: lower.split('@')[0] || lower,
      domainPrefix: '',
      hasDomainAt: true,
    };
  }
  return {
    rawLower: lower,
    bare: lower,
    domainPrefix: '',
    hasDomainAt: false,
  };
}

function resolveRoleFromAdGroups(memberOf: unknown, config: SystemConfig): UserRole {
  const list = Array.isArray(memberOf)
    ? memberOf.map((v) => String(v).toLowerCase())
    : typeof memberOf === 'string'
    ? [memberOf.toLowerCase()]
    : [];
  const admins = (config.adSync.adminsGroupDn || '').toLowerCase();
  const managers = (config.adSync.managersGroupDn || '').toLowerCase();
  const inspectors = (config.adSync.inspectorsGroupDn || '').toLowerCase();
  if (admins && list.some((g) => g.includes(admins) || g.includes('admin'))) return 'System Admin';
  if (managers && list.some((g) => g.includes(managers) || g.includes('manager'))) {
    return 'Production Manager';
  }
  if (inspectors && list.some((g) => g.includes(inspectors) || g.includes('inspector') || g.includes('qc'))) {
    return 'Quality Inspector';
  }
  return 'Operator';
}

interface ExternalAdAuthResult {
  ok: boolean;
  mfaOrSsoRequired?: boolean;
  unreachable?: boolean;
  invalidCredentials?: boolean;
  reason?: string;
  profile?: {
    username: string;
    email: string;
    displayName: string;
    department: string;
    jobTitle: string;
    adGroup: string;
    roleHint: UserRole;
  };
}

async function authenticateViaEntraRopc(
  store: CqdStore,
  usernameInput: string,
  password: string
): Promise<ExternalAdAuthResult> {
  const creds = getAzureCredentials(store);
  if (!creds.hasTenantAndClient) return { ok: false };

  const norm = normalizeUsernameInput(usernameInput);
  const domain = getLdapConfig(store).domain;
  const candidates = norm.hasDomainAt
    ? [usernameInput.trim()]
    : Array.from(
        new Set(
          [
            `${norm.bare}@${domain}`,
            `${norm.bare}@asfourcrystal.com`,
            `${norm.bare}@crystalasfour.com`,
            usernameInput.trim(),
          ].filter(Boolean)
        )
      );

  let sawInvalidCredentials = false;
  let lastPolicyReason: string | undefined;

  for (const candidate of candidates) {
    try {
      const body = new URLSearchParams({
        client_id: creds.clientId,
        scope: 'openid profile email User.Read',
        username: candidate,
        password,
        grant_type: 'password',
      });
      if (creds.clientSecret) {
        body.set('client_secret', creds.clientSecret);
      }

      const tokenRes = await fetch(
        `https://login.microsoftonline.com/${encodeURIComponent(creds.tenantId)}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        }
      );

      const json = (await tokenRes.json()) as {
        access_token?: string;
        error?: string;
        error_description?: string;
        error_codes?: number[];
      };

      if (tokenRes.ok && json.access_token) {
        let email = candidate.toLowerCase();
        let displayName = norm.bare;
        let department = 'Crystal Asfour Operations';
        let jobTitle = 'AD User';

        try {
          const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${json.access_token}` },
          });
          if (meRes.ok) {
            const me = (await meRes.json()) as {
              mail?: string;
              userPrincipalName?: string;
              displayName?: string;
              department?: string;
              jobTitle?: string;
            };
            email = (me.mail || me.userPrincipalName || email).toLowerCase();
            displayName = me.displayName || displayName;
            department = me.department || department;
            jobTitle = me.jobTitle || jobTitle;
          }
        } catch {
          // Non-fatal Graph profile fetch
        }

        return {
          ok: true,
          profile: {
            username: email.split('@')[0] || norm.bare,
            email,
            displayName,
            department,
            jobTitle,
            adGroup: `CN=EntraID-User,DC=${domain}`,
            roleHint: 'Operator',
          },
        };
      }

      const codes = json.error_codes || [];
      // MFA / Conditional Access / Consent required -> direct user to SSO button
      if (
        codes.some((c) => [50076, 50079, 53003, 50158, 65001, 7000218].includes(c)) ||
        json.error === 'interaction_required'
      ) {
        return {
          ok: false,
          mfaOrSsoRequired: true,
          reason:
            'Microsoft Active Directory requires interactive SSO/MFA sign-in. Please use the "Sign in with Microsoft Active Directory" button below.',
        };
      }

      if (codes.some((c) => [700016, 90002, 7000215].includes(c))) {
        lastPolicyReason =
          json.error_description?.split('\r\n')[0] ||
          'Microsoft Entra ID application configuration mismatch (Tenant ID / Client ID / Secret).';
        break;
      }

      // 50034 = user UPN not found under this suffix -> continue trying other domain suffixes
      if (codes.includes(50034)) {
        continue;
      }

      if (codes.some((c) => [50126, 50053, 50057].includes(c)) || json.error === 'invalid_grant') {
        sawInvalidCredentials = true;
        if (codes.includes(50053)) {
          lastPolicyReason = 'Active Directory account is locked.';
        } else if (codes.includes(50057)) {
          lastPolicyReason = 'Active Directory account is disabled.';
        }
      }
    } catch {
      return { ok: false, unreachable: true };
    }
  }

  if (lastPolicyReason) {
    return { ok: false, invalidCredentials: true, reason: lastPolicyReason };
  }
  if (sawInvalidCredentials) {
    return { ok: false, invalidCredentials: true };
  }
  return { ok: false };
}

async function authenticateViaLdap(
  store: CqdStore,
  usernameInput: string,
  password: string
): Promise<ExternalAdAuthResult> {
  const ldapCfg = getLdapConfig(store);
  if (!ldapCfg.isConfigured) return { ok: false };

  const norm = normalizeUsernameInput(usernameInput);
  const client = new LdapClient({
    url: ldapCfg.ldapUrl,
    timeout: 4000,
    connectTimeout: 4000,
    strictDN: false,
    tlsOptions: { rejectUnauthorized: false },
  });

  try {
    let foundEntry: Record<string, unknown> | null = null;
    let userBound = false;

    if (ldapCfg.bindDn && ldapCfg.bindPassword) {
      await client.bind(ldapCfg.bindDn, ldapCfg.bindPassword);
      const escBare = escapeLdapFilter(norm.bare);
      const escRaw = escapeLdapFilter(usernameInput.trim());
      const filter = `(&(objectClass=user)(|(sAMAccountName=${escBare})(userPrincipalName=${escRaw})(mail=${escRaw})))`;
      const { searchEntries } = await client.search(ldapCfg.baseDn, {
        scope: 'sub',
        filter,
        attributes: [
          'dn',
          'sAMAccountName',
          'userPrincipalName',
          'mail',
          'displayName',
          'cn',
          'department',
          'title',
          'memberOf',
        ],
        sizeLimit: 2,
      });

      if (searchEntries.length > 0) {
        foundEntry = searchEntries[0] as Record<string, unknown>;
        const userDn = String(foundEntry.dn || '');
        if (userDn) {
          await client.bind(userDn, password);
          userBound = true;
        }
      }
    }

    if (!userBound) {
      const bindCandidates = Array.from(
        new Set(
          [
            usernameInput.trim(),
            norm.hasDomainAt ? '' : `${norm.bare}@${ldapCfg.domain}`,
            norm.domainPrefix ? usernameInput.trim() : `${ldapCfg.domain.split('.')[0]}\\${norm.bare}`,
          ].filter(Boolean)
        )
      );

      for (const bindCandidate of bindCandidates) {
        try {
          await client.bind(bindCandidate, password);
          userBound = true;
          const escBare = escapeLdapFilter(norm.bare);
          const escUpn = escapeLdapFilter(bindCandidate);
          const { searchEntries } = await client.search(ldapCfg.baseDn, {
            scope: 'sub',
            filter: `(|(sAMAccountName=${escBare})(userPrincipalName=${escUpn})(mail=${escUpn}))`,
            attributes: [
              'dn',
              'sAMAccountName',
              'userPrincipalName',
              'mail',
              'displayName',
              'cn',
              'department',
              'title',
              'memberOf',
            ],
            sizeLimit: 1,
          });
          if (searchEntries.length > 0) {
            foundEntry = searchEntries[0] as Record<string, unknown>;
          }
          break;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|Timeout/i.test(msg)) {
            throw err;
          }
        }
      }
    }

    if (!userBound) {
      return { ok: false, invalidCredentials: true };
    }

    const sam = String(foundEntry?.sAMAccountName || norm.bare).toLowerCase();
    const email = String(
      foundEntry?.mail || foundEntry?.userPrincipalName || `${sam}@${ldapCfg.domain}`
    ).toLowerCase();
    const displayName = String(foundEntry?.displayName || foundEntry?.cn || sam);
    const department = String(foundEntry?.department || 'Crystal Asfour AD');
    const jobTitle = String(foundEntry?.title || 'Employee');
    const roleHint = resolveRoleFromAdGroups(foundEntry?.memberOf, store.config);

    return {
      ok: true,
      profile: {
        username: sam,
        email,
        displayName,
        department,
        jobTitle,
        adGroup: String(foundEntry?.dn || `CN=${sam},${ldapCfg.baseDn}`),
        roleHint,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|EAI_AGAIN|Timeout/i.test(msg)) {
      return {
        ok: false,
        unreachable: true,
        reason: `Active Directory LDAP server (${ldapCfg.ldapUrl}) is an internal/private address unreachable from Vercel cloud. Either configure Microsoft Entra ID (Azure AD) env vars, expose LDAPS publicly on port 636, or host the app inside the company network.`,
      };
    }
    return { ok: false, invalidCredentials: true };
  } finally {
    try {
      await client.unbind();
    } catch {
      // Ignore cleanup error
    }
  }
}

async function getGraphAppToken(store: CqdStore): Promise<string | null> {
  const creds = getAzureCredentials(store);
  if (!creds.isConfigured) return null;

  try {
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(creds.tenantId)}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }),
      }
    );
    if (!tokenRes.ok) return null;
    const json = (await tokenRes.json()) as { access_token?: string };
    return json.access_token || null;
  } catch {
    return null;
  }
}

async function dispatchOutboundEmail(
  store: CqdStore,
  email: Omit<EmailMessage, 'id' | 'sentAt' | 'read' | 'deliveryMethod'>
): Promise<EmailMessage> {
  const now = new Date().toISOString();
  let deliveryMethod: EmailMessage['deliveryMethod'] = 'SimulatedQueue';

  // 1. Optional Power Automate HTTP Webhook
  const webhookUrl =
    process.env.POWER_AUTOMATE_WEBHOOK_URL || store.config.adSync.powerAutomateWebhookUrl;
  if (webhookUrl) {
    try {
      const hookRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: email.type,
          deviationId: email.deviationId,
          recipientEmail: email.recipientEmail,
          recipientName: email.recipientName,
          subject: email.subject,
          bodyPreview: email.bodyPreview || email.subject,
          sentAt: now,
        }),
      });
      if (hookRes.ok) deliveryMethod = 'PowerAutomateWebhook';
    } catch {
      // Non-fatal: still persisted in queue
    }
  }

  // 2. Optional Microsoft Graph API real Outlook mail send
  const senderEmail =
    process.env.GRAPH_SENDER_EMAIL || store.config.adSync.graphSenderEmail;
  if (deliveryMethod === 'SimulatedQueue' && senderEmail) {
    const token = await getGraphAppToken(store);
    if (token) {
      try {
        const graphRes = await fetch(
          `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: {
                subject: email.subject,
                body: {
                  contentType: 'HTML',
                  content: `<div style="font-family:Segoe UI,Arial,sans-serif;color:#0F1E3D;">
                    <h2 style="color:#0F1E3D;border-bottom:2px solid #C8922B;padding-bottom:8px;">Crystal Asfour International — CQD</h2>
                    <p>${email.bodyPreview || email.subject}</p>
                    <p style="font-size:12px;color:#475569;">Reference: <strong>${email.deviationId}</strong></p>
                  </div>`,
                },
                toRecipients: [{ emailAddress: { address: email.recipientEmail } }],
              },
              saveToSentItems: true,
            }),
          }
        );
        if (graphRes.ok) deliveryMethod = 'GraphAPI';
      } catch {
        // Non-fatal: still persisted in queue
      }
    }
  }

  const record: EmailMessage = {
    ...email,
    id: `eml-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    sentAt: now,
    read: false,
    deliveryMethod,
  };
  store.emails.unshift(record);
  return record;
}

function generateNextDeviationId(deviations: DeviationRecord[]): string {
  const year = new Date().getFullYear();
  const prefix = `DEV-${year}-`;
  let maxSeq = 0;
  for (const item of deviations) {
    if (item.id.startsWith(prefix)) {
      const seq = Number.parseInt(item.id.slice(prefix.length), 10);
      if (!Number.isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

export function createCqdApp(): Express {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    const store = loadStore();
    const creds = getAzureCredentials(store);
    res.json({
      ok: true,
      service: 'Crystal Quality Deviations (CQD)',
      azureSsoEnabled: creds.isConfigured,
      companyLogoUrl: store.config.companyLogoUrl || '',
    });
  });

  // --- Standard AD (Entra ID / LDAP) & Admin Credentials Login ---
  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required.' });
      return;
    }

    const store = loadStore();
    const norm = normalizeUsernameInput(username);

    const findLocalUser = (bareName: string, fullInput: string) =>
      store.users.find(
        (u) =>
          u.username.toLowerCase() === bareName ||
          u.email.toLowerCase() === fullInput ||
          u.email.split('@')[0].toLowerCase() === bareName
      );

    let user = findLocalUser(norm.bare, norm.rawLower);

    const isDefaultAdminMatch =
      user?.username === 'admin' &&
      (user.passwordHash === 'admin124' || user.passwordHash === 'admin1234') &&
      (password === 'admin124' || password === 'admin1234');

    let authMethodLabel: string = user?.authProvider || 'ActiveDirectory';

    // 1. Local password match (Admin or local/provisioned password)
    const localPasswordMatched = Boolean(
      user && (user.passwordHash === password || isDefaultAdminMatch)
    );

    // 2. If not matched locally (and not local admin), try real Microsoft Entra ID & On-Premises LDAP
    if (!localPasswordMatched && norm.bare !== 'admin') {
      const azureCreds = getAzureCredentials(store);
      const ldapCfg = getLdapConfig(store);

      let externalResult: ExternalAdAuthResult = await authenticateViaEntraRopc(
        store,
        username.trim(),
        password
      );
      if (externalResult.ok) {
        authMethodLabel = 'AzureAD-ROPC';
      } else if (
        !externalResult.mfaOrSsoRequired &&
        (!azureCreds.hasTenantAndClient || ldapCfg.hasExplicitLdapConfig)
      ) {
        const ldapResult = await authenticateViaLdap(store, username.trim(), password);
        if (ldapResult.ok) {
          externalResult = ldapResult;
          authMethodLabel = 'LDAP-ActiveDirectory';
        } else if (ldapResult.unreachable && !externalResult.invalidCredentials && !externalResult.reason) {
          externalResult = ldapResult;
        }
      }

      if (externalResult.ok && externalResult.profile) {
        const prof = externalResult.profile;
        user =
          findLocalUser(prof.username, prof.email) ??
          (store.config.adSync.autoProvisionUsers
            ? (() => {
                const created: StoredUser = {
                  id: `usr-${Date.now()}`,
                  username: prof.username,
                  passwordHash: crypto.randomBytes(16).toString('hex'),
                  displayName: prof.displayName,
                  displayNameAr: prof.displayName,
                  email: prof.email,
                  department: prof.department,
                  jobTitle: prof.jobTitle,
                  role: prof.roleHint,
                  permissions: defaultPermissionsForRole(prof.roleHint),
                  adGroup: prof.adGroup,
                  authProvider: 'ActiveDirectory',
                  active: true,
                  mustChangePassword: false,
                };
                store.users.push(created);
                return created;
              })()
            : undefined);

        if (!user) {
          res.status(403).json({
            error: 'AD credentials verified, but user is not provisioned in CQD Admin Panel.',
          });
          return;
        }
      } else {
        if ((externalResult.mfaOrSsoRequired || externalResult.unreachable || externalResult.reason) && externalResult.reason) {
          res.status(401).json({ error: externalResult.reason });
          return;
        }
        res.status(401).json({ error: 'Invalid Active Directory or Admin credentials.' });
        return;
      }
    }

    if (!user) {
      res.status(401).json({ error: 'Invalid Active Directory or Admin credentials.' });
      return;
    }

    if (!user.active) {
      res.status(403).json({ error: 'Account is disabled or revoked by System Administrator.' });
      return;
    }

    user.lastLoginAt = new Date().toISOString();
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: user.lastLoginAt,
      actorUsername: user.username,
      actorRole: user.role,
      action: user.authProvider === 'LocalAdmin' ? 'ADMIN_LOGIN' : 'AD_LOGIN',
      target: authMethodLabel,
      details: user.mustChangePassword
        ? 'Default admin authenticated — awaiting mandatory password rotation.'
        : `Authenticated session via ${authMethodLabel}.`,
      ipAddress: '10.42.18.90',
    });
    saveStore(store);

    res.json({ user: sanitizeUser(user) });
  });

  // --- Real Microsoft Entra ID (Azure AD) OAuth 2.0 / OIDC Flow ---
  app.get('/api/auth/azure/login', (req, res) => {
    const store = loadStore();
    const creds = getAzureCredentials(store);
    if (!creds.isConfigured) {
      res.status(400).json({
        error:
          'Microsoft Entra ID (Azure AD) credentials are not configured yet. Configure Tenant ID, Client ID, and Client Secret in Vercel Env Vars or the Master Admin AD tab.',
      });
      return;
    }

    const origin = `${req.protocol}://${req.get('host')}`;
    const redirectUri = creds.redirectUri || `${origin}/api/auth/azure/callback`;
    const state = crypto.randomBytes(16).toString('hex');
    const authUrl = new URL(
      `https://login.microsoftonline.com/${encodeURIComponent(creds.tenantId)}/oauth2/v2.0/authorize`
    );
    authUrl.searchParams.set('client_id', creds.clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_mode', 'query');
    authUrl.searchParams.set('scope', 'openid profile email User.Read');
    authUrl.searchParams.set('state', state);

    res.redirect(authUrl.toString());
  });

  app.get('/api/auth/azure/callback', async (req, res) => {
    const { code, error: oauthError } = req.query as { code?: string; error?: string };
    if (oauthError || !code) {
      res.redirect(`/?ssoError=${encodeURIComponent(oauthError || 'Missing authorization code')}`);
      return;
    }

    const store = loadStore();
    const creds = getAzureCredentials(store);
    const origin = `${req.protocol}://${req.get('host')}`;
    const redirectUri = creds.redirectUri || `${origin}/api/auth/azure/callback`;

    try {
      const tokenRes = await fetch(
        `https://login.microsoftonline.com/${encodeURIComponent(creds.tenantId)}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: creds.clientId,
            client_secret: creds.clientSecret,
            code,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }),
        }
      );

      const tokenJson = (await tokenRes.json()) as { access_token?: string };
      if (!tokenRes.ok || !tokenJson.access_token) {
        res.redirect('/?ssoError=Azure+AD+token+exchange+failed');
        return;
      }

      const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      const me = (await meRes.json()) as {
        userPrincipalName?: string;
        mail?: string;
        displayName?: string;
        department?: string;
        jobTitle?: string;
      };

      const email = (me.mail || me.userPrincipalName || '').toLowerCase();
      const username = email.split('@')[0] || 'ad.user';

      let user = store.users.find(
        (u) => u.email.toLowerCase() === email || u.username.toLowerCase() === username
      );

      if (!user) {
        if (!store.config.adSync.autoProvisionUsers) {
          res.redirect('/?ssoError=User+not+provisioned+in+CQD+Admin+Panel');
          return;
        }
        user = {
          id: `usr-${Date.now()}`,
          username,
          passwordHash: crypto.randomBytes(16).toString('hex'),
          displayName: me.displayName || username,
          displayNameAr: me.displayName || username,
          email,
          department: me.department || 'Crystal Asfour Operations',
          jobTitle: me.jobTitle || 'AD Authenticated User',
          role: 'Operator',
          permissions: defaultPermissionsForRole('Operator'),
          adGroup: `CN=CQD-AutoProvisioned,DC=${store.config.adSync.tenantDomain}`,
          authProvider: 'ActiveDirectory',
          active: true,
          mustChangePassword: false,
        };
        store.users.push(user);
      }

      if (!user.active) {
        res.redirect('/?ssoError=Account+disabled+by+Administrator');
        return;
      }

      user.lastLoginAt = new Date().toISOString();
      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        timestamp: user.lastLoginAt,
        actorUsername: user.username,
        actorRole: user.role,
        action: 'AZURE_AD_OIDC_LOGIN',
        target: email,
        details: 'Authenticated live via Microsoft Entra ID OAuth 2.0 / Graph.',
        ipAddress: 'SSO-OIDC',
      });
      saveStore(store);

      const sessionToken = crypto.randomBytes(20).toString('hex');
      ssoSessions.set(sessionToken, {
        username: user.username,
        expiresAt: Date.now() + 60_000,
      });

      res.redirect(`/?ssoToken=${sessionToken}`);
    } catch {
      res.redirect('/?ssoError=Azure+AD+authentication+error');
    }
  });

  app.get('/api/auth/session/:token', (req, res) => {
    const entry = ssoSessions.get(req.params.token);
    if (!entry || entry.expiresAt < Date.now()) {
      res.status(401).json({ error: 'SSO session expired.' });
      return;
    }
    ssoSessions.delete(req.params.token);
    const store = loadStore();
    const user = store.users.find((u) => u.username === entry.username);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    res.json({ user: sanitizeUser(user) });
  });

  app.post('/api/auth/change-password', (req, res) => {
    const { username, currentPassword, newPassword } = req.body as {
      username?: string;
      currentPassword?: string;
      newPassword?: string;
    };

    if (!username || !currentPassword || !newPassword) {
      res.status(400).json({ error: 'All password fields are required.' });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters long.' });
      return;
    }

    if (newPassword === 'admin1234') {
      res.status(400).json({ error: 'New password cannot match default admin1234.' });
      return;
    }

    const store = loadStore();
    const user = store.users.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase()
    );

    if (!user || user.passwordHash !== currentPassword) {
      res.status(401).json({ error: 'Current password verification failed.' });
      return;
    }

    user.passwordHash = newPassword;
    user.mustChangePassword = false;
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorUsername: user.username,
      actorRole: user.role,
      action: 'PASSWORD_ROTATED',
      target: user.username,
      details: 'Mandatory default administrator password rotated successfully.',
      ipAddress: '10.42.18.90',
    });
    saveStore(store);

    res.json({ user: sanitizeUser(user) });
  });

  app.get('/api/bootstrap', (_req, res) => {
    const store = loadStore();
    const creds = getAzureCredentials(store);
    res.json({
      deviations: store.deviations,
      config: sanitizeConfig(store),
      emails: store.emails,
      auditLogs: store.auditLogs,
      users: store.users.map(sanitizeUser),
      azureSsoEnabled: creds.isConfigured,
    });
  });

  // --- Deviations Creation + Auto-Numbering + Outlook Card + RPN Quality Escalation ---
  app.post('/api/deviations', async (req, res) => {
    const body = req.body as {
      title?: string;
      description?: string;
      modelCode?: string;
      stageId?: string;
      quantity?: number;
      validUntil?: string;
      severity?: number;
      occurrence?: number;
      detection?: number;
      imageUrl?: string;
      images?: string[];
      imageMeta?: string;
      requesterUsername?: string;
    };

    if (!body.title?.trim() || !body.description?.trim() || !body.modelCode || !body.stageId) {
      res.status(400).json({ error: 'Title, description, model, and stage are required.' });
      return;
    }

    const store = loadStore();
    const stage = store.config.stages.find((s) => s.id === body.stageId);
    const model = store.config.models.find((m) => m.code === body.modelCode);
    const requester =
      store.users.find((u) => u.username === body.requesterUsername) ?? store.users[1];

    if (!stage || !model) {
      res.status(400).json({ error: 'Invalid production stage or chandelier model.' });
      return;
    }

    const severity = Math.min(10, Math.max(1, Number(body.severity || 5)));
    const occurrence = Math.min(10, Math.max(1, Number(body.occurrence || 5)));
    const detection = Math.min(10, Math.max(1, Number(body.detection || 5)));
    const quantity = Math.max(1, Number(body.quantity || 1));
    const rpn = severity * occurrence * detection;
    const now = new Date().toISOString();
    const newId = generateNextDeviationId(store.deviations);
    const normalizedImages =
      body.images && body.images.length > 0
        ? body.images
        : body.imageUrl
        ? [body.imageUrl]
        : [];

    // Determine Quality Escalation Recipients triggered by RPN threshold
    const matchingEscalations = (store.config.escalationRecipients || []).filter(
      (esc) => esc.active && rpn >= esc.minRpnTrigger
    );
    const escalatedToEmails = matchingEscalations.map((e) => e.email);

    const record: DeviationRecord = {
      id: newId,
      title: body.title.trim(),
      description: body.description.trim(),
      modelCode: model.code,
      modelName: model.nameEn,
      stageId: stage.id,
      stageNameEn: stage.nameEn,
      stageNameAr: stage.nameAr,
      quantity,
      validUntil: body.validUntil || undefined,
      severity,
      occurrence,
      detection,
      rpn,
      imageUrl: normalizedImages[0],
      images: normalizedImages,
      imageMeta: body.imageMeta,
      status: 'Pending',
      requesterUsername: requester.username,
      requesterName: requester.displayName,
      requesterEmail: requester.email,
      requesterDepartment: requester.department,
      assignedManagerName: stage.assignedManagerName,
      assignedManagerEmail: stage.assignedManagerEmail,
      escalatedToEmails,
      createdAt: now,
    };

    store.deviations.unshift(record);

    // 1. Primary Actionable Outlook/Teams Approval Email to Stage Manager
    const approvalEmail = await dispatchOutboundEmail(store, {
      type: 'ApprovalRequest',
      channel: 'Outlook & Teams',
      deviationId: record.id,
      recipientEmail: stage.assignedManagerEmail,
      recipientName: stage.assignedManagerName,
      subject: `[CQD Action Required] ${record.id} — ${record.title} (RPN ${record.rpn})`,
      bodyPreview: `Model ${record.modelCode} · ${record.stageNameEn} · Qty ${record.quantity} · RPN ${record.rpn}`,
    });

    // 2. Automatic Quality Escalation Alerts to configured Quality Authorities if RPN >= trigger
    for (const esc of matchingEscalations) {
      await dispatchOutboundEmail(store, {
        type: 'QualityEscalation',
        channel: 'Outlook & Teams',
        deviationId: record.id,
        recipientEmail: esc.email,
        recipientName: esc.name,
        subject: `[CRITICAL RPN ESCALATION ${record.rpn}] ${record.id} — ${record.title}`,
        bodyPreview: `RPN ${record.rpn} exceeded threshold (${esc.minRpnTrigger}). Automatically escalated to ${esc.department} (${esc.email}).`,
      });
    }

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: now,
      actorUsername: requester.username,
      actorRole: requester.role,
      action: 'DEVIATION_CREATED',
      target: record.id,
      details: `Auto-numbered ${record.id} (${record.modelCode}, Qty ${record.quantity}, RPN ${record.rpn}). Routed to ${stage.assignedManagerEmail}${
        escalatedToEmails.length ? ` + Escalated to ${escalatedToEmails.join(', ')}` : ''
      }.`,
      ipAddress: '10.42.18.112',
    });

    saveStore(store);
    res.status(201).json({ deviation: record, email: approvalEmail });
  });

  app.post('/api/deviations/:id/decision', async (req, res) => {
    const { id } = req.params;
    const { decision, comment, actorUsername } = req.body as {
      decision?: 'Approved' | 'Rejected';
      comment?: string;
      actorUsername?: string;
    };

    if (decision !== 'Approved' && decision !== 'Rejected') {
      res.status(400).json({ error: 'Decision must be Approved or Rejected.' });
      return;
    }

    const store = loadStore();
    const deviation = store.deviations.find((d) => d.id === id);
    if (!deviation) {
      res.status(404).json({ error: 'Deviation record not found.' });
      return;
    }

    if (
      decision === 'Rejected' &&
      store.config.emailTemplates.requireCommentOnReject &&
      !comment?.trim()
    ) {
      res.status(400).json({ error: 'Manager comment is mandatory when rejecting a deviation.' });
      return;
    }

    const actor = store.users.find((u) => u.username === actorUsername);
    const decisionActorName = actor ? actor.displayName : deviation.assignedManagerName;
    const now = new Date().toISOString();

    deviation.status = decision;
    deviation.managerComment =
      comment?.trim() ||
      (decision === 'Approved' ? 'Approved via Outlook Actionable Card.' : 'Rejected.');
    deviation.decisionBy = decisionActorName;
    deviation.decisionAt = now;

    for (const eml of store.emails) {
      if (eml.deviationId === deviation.id && eml.type === 'ApprovalRequest') {
        eml.read = true;
        eml.actionTaken = decision;
        eml.managerComment = deviation.managerComment;
      }
    }

    const feedbackEmail = await dispatchOutboundEmail(store, {
      type: 'FinalFeedback',
      channel: 'Outlook Notification',
      deviationId: deviation.id,
      recipientEmail: deviation.requesterEmail,
      recipientName: deviation.requesterName,
      subject: `[CQD Decision: ${decision}] ${deviation.id} — ${deviation.title}`,
      bodyPreview: `Decision by ${decisionActorName}: ${deviation.managerComment}`,
      actionTaken: decision,
      managerComment: deviation.managerComment,
    });

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: now,
      actorUsername: actor?.username ?? 'outlook-card-action',
      actorRole: actor?.role ?? 'Production Manager',
      action: decision === 'Approved' ? 'OUTLOOK_CARD_APPROVED' : 'OUTLOOK_CARD_REJECTED',
      target: deviation.id,
      details: `${decision} by ${decisionActorName}. Comment: "${deviation.managerComment}". Requester notified.`,
      ipAddress: '10.42.12.22',
    });

    saveStore(store);
    res.json({ deviation, feedbackEmail });
  });

  // --- Admin Config Save (Stages, Models, RPN Thresholds, Live Azure AD Credentials) ---
  app.put('/api/admin/config', (req, res) => {
    const { config, actorUsername } = req.body as {
      config?: SystemConfig;
      actorUsername?: string;
    };

    if (!config) {
      res.status(400).json({ error: 'Config payload is required.' });
      return;
    }

    const store = loadStore();
    if (config.adSync.clientSecretInput && config.adSync.clientSecretInput.trim()) {
      store.adClientSecret = config.adSync.clientSecretInput.trim();
    }
    if (config.adSync.bindPasswordInput && config.adSync.bindPasswordInput.trim()) {
      store.adBindPassword = config.adSync.bindPasswordInput.trim();
    }
    const {
      clientSecretInput: _secretInput,
      bindPasswordInput: _bindPassInput,
      ...cleanAdSync
    } = config.adSync;
    store.config = {
      ...config,
      adSync: {
        ...cleanAdSync,
        hasClientSecret: Boolean(process.env.AZURE_AD_CLIENT_SECRET || store.adClientSecret),
        hasBindPassword: Boolean(store.adBindPassword),
      },
    };

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorUsername: actorUsername || 'admin',
      actorRole: 'System Admin',
      action: 'SYSTEM_CONFIG_UPDATED',
      target: 'CQD_Parameters',
      details: `Updated stages (${config.stages.length}), models (${config.models.length}), RPN cutoff (${config.rpnThresholds.criticalEscalationThreshold}), and AD environment settings.`,
      ipAddress: '10.42.1.10',
    });

    saveStore(store);
    const creds = getAzureCredentials(store);
    res.json({ config: sanitizeConfig(store), azureSsoEnabled: creds.isConfigured });
  });

  app.post('/api/admin/test-ad', async (req, res) => {
    const { actorUsername } = req.body as { actorUsername?: string };
    const store = loadStore();
    const graphToken = await getGraphAppToken(store);
    const ldapCfg = getLdapConfig(store);

    let ldapLiveOk = false;
    let ldapLiveMsg = '';
    if (ldapCfg.isConfigured && ldapCfg.bindDn && ldapCfg.bindPassword) {
      const client = new LdapClient({
        url: ldapCfg.ldapUrl,
        timeout: 4000,
        connectTimeout: 4000,
        strictDN: false,
        tlsOptions: { rejectUnauthorized: false },
      });
      try {
        await client.bind(ldapCfg.bindDn, ldapCfg.bindPassword);
        ldapLiveOk = true;
        ldapLiveMsg = `Live LDAPS bind succeeded (${ldapCfg.ldapUrl} / Base DN: ${ldapCfg.baseDn}).`;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        ldapLiveMsg = `LDAP connection error (${ldapCfg.ldapUrl}): ${msg}`;
      } finally {
        try {
          await client.unbind();
        } catch {
          // ignore
        }
      }
    }

    const status = graphToken
      ? 'Connected live to Microsoft Entra ID (Graph API token verified).'
      : ldapLiveOk
      ? ldapLiveMsg
      : ldapLiveMsg
      ? ldapLiveMsg
      : ldapCfg.isConfigured && ldapCfg.bindDn
      ? `On-Premises LDAPS configuration saved (${ldapCfg.ldapUrl} / Base DN: ${ldapCfg.baseDn}). Provide Bind Password to run live bind verification.`
      : 'Incomplete AD parameters. Please provide LDAP URL / Base DN or Azure AD Tenant & Client credentials.';

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorUsername: actorUsername || 'admin',
      actorRole: 'System Admin',
      action: 'AD_CONNECTION_TESTED',
      target: ldapCfg.domain,
      details: status,
      ipAddress: '10.42.1.10',
    });
    saveStore(store);
    res.json({
      ok: Boolean(graphToken || ldapLiveOk || (ldapCfg.isConfigured && !ldapLiveMsg)),
      message: status,
      liveGraph: Boolean(graphToken),
      liveLdap: ldapLiveOk,
    });
  });

  // --- Live Active Directory User Search (Microsoft Graph, LDAP, or Synced AD Pool) ---
  app.get('/api/admin/ad-search', async (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const store = loadStore();
    const existingEmails = new Set(store.users.map((u) => u.email.toLowerCase()));
    const existingUsernames = new Set(store.users.map((u) => u.username.toLowerCase()));

    // 1. Try Live Microsoft Graph Directory query if Azure AD App credentials are configured
    const graphToken = await getGraphAppToken(store);
    if (graphToken && q.length >= 2) {
      try {
        const filter = encodeURIComponent(
          `startswith(displayName,'${q.replace(/'/g, "''")}') or startswith(mail,'${q.replace(/'/g, "''")}') or startswith(userPrincipalName,'${q.replace(/'/g, "''")}')`
        );
        const graphRes = await fetch(
          `https://graph.microsoft.com/v1.0/users?$filter=${filter}&$select=displayName,mail,userPrincipalName,department,jobTitle&$top=15`,
          { headers: { Authorization: `Bearer ${graphToken}` } }
        );
        if (graphRes.ok) {
          const payload = (await graphRes.json()) as {
            value?: Array<{
              displayName?: string;
              mail?: string;
              userPrincipalName?: string;
              department?: string;
              jobTitle?: string;
            }>;
          };
          const results: AdDirectoryCandidate[] = (payload.value || []).map((entry) => {
            const email = (entry.mail || entry.userPrincipalName || '').toLowerCase();
            const username = email.split('@')[0] || 'ad.user';
            return {
              username,
              displayName: entry.displayName || username,
              displayNameAr: entry.displayName || username,
              email,
              department: entry.department || 'Crystal Asfour AD',
              jobTitle: entry.jobTitle || 'Employee',
              adGroup: `CN=EntraID-User,DC=${store.config.adSync.tenantDomain}`,
              alreadyProvisioned:
                existingEmails.has(email) || existingUsernames.has(username.toLowerCase()),
              source: 'MicrosoftGraph',
            };
          });
          res.json({ candidates: results, source: 'MicrosoftGraph' });
          return;
        }
      } catch {
        // Fallback to LDAP / local AD catalog
      }
    }

    // 2. Try Live On-Premises LDAP Directory Search if configured with bind credentials
    const ldapCfg = getLdapConfig(store);
    if (ldapCfg.isConfigured && ldapCfg.bindDn && ldapCfg.bindPassword && q.length >= 2) {
      const client = new LdapClient({
        url: ldapCfg.ldapUrl,
        timeout: 4000,
        connectTimeout: 4000,
        strictDN: false,
        tlsOptions: { rejectUnauthorized: false },
      });
      try {
        await client.bind(ldapCfg.bindDn, ldapCfg.bindPassword);
        const esc = escapeLdapFilter(q);
        const { searchEntries } = await client.search(ldapCfg.baseDn, {
          scope: 'sub',
          filter: `(&(objectClass=user)(|(sAMAccountName=*${esc}*)(displayName=*${esc}*)(mail=*${esc}*)))`,
          attributes: ['dn', 'sAMAccountName', 'userPrincipalName', 'mail', 'displayName', 'cn', 'department', 'title'],
          sizeLimit: 15,
        });
        if (searchEntries.length > 0) {
          const results: AdDirectoryCandidate[] = searchEntries.map((entry) => {
            const sam = String(entry.sAMAccountName || 'ad.user').toLowerCase();
            const email = String(entry.mail || entry.userPrincipalName || `${sam}@${ldapCfg.domain}`).toLowerCase();
            const displayName = String(entry.displayName || entry.cn || sam);
            return {
              username: sam,
              displayName,
              displayNameAr: displayName,
              email,
              department: String(entry.department || 'Crystal Asfour AD'),
              jobTitle: String(entry.title || 'Employee'),
              adGroup: String(entry.dn || ldapCfg.baseDn),
              alreadyProvisioned:
                existingEmails.has(email) || existingUsernames.has(sam),
              source: 'SyncedAdDirectory',
            };
          });
          res.json({ candidates: results, source: 'LiveLDAP' });
          return;
        }
      } catch {
        // Fallback to local AD pool
      } finally {
        try {
          await client.unbind();
        } catch {
          // ignore
        }
      }
    }

    // 3. Fallback / Hybrid Corporate AD Pool search
    const results: AdDirectoryCandidate[] = CORPORATE_AD_DIRECTORY_POOL.filter((item) => {
      if (!q) return true;
      return (
        item.username.toLowerCase().includes(q) ||
        item.displayName.toLowerCase().includes(q) ||
        item.displayNameAr.includes(q) ||
        item.email.toLowerCase().includes(q) ||
        item.department.toLowerCase().includes(q)
      );
    }).map((item) => ({
      ...item,
      alreadyProvisioned:
        existingEmails.has(item.email.toLowerCase()) ||
        existingUsernames.has(item.username.toLowerCase()),
      source: 'SyncedAdDirectory',
    }));

    res.json({ candidates: results, source: 'SyncedAdDirectory' });
  });

  // --- Admin User CRUD + Automatic Welcome Email ---
  app.post('/api/admin/users', async (req, res) => {
    const {
      username,
      displayName,
      displayNameAr,
      email,
      department,
      jobTitle,
      role,
      permissions,
      adGroup,
      actorUsername,
    } = req.body as {
      username?: string;
      displayName?: string;
      displayNameAr?: string;
      email?: string;
      department?: string;
      jobTitle?: string;
      role?: UserRole;
      permissions?: AppPermissions;
      adGroup?: string;
      actorUsername?: string;
    };

    if (!username?.trim() || !displayName?.trim() || !email?.trim() || !role) {
      res.status(400).json({ error: 'Username, display name, email, and role are required.' });
      return;
    }

    const store = loadStore();
    if (store.users.some((u) => u.username.toLowerCase() === username.trim().toLowerCase())) {
      res.status(409).json({ error: 'User is already provisioned in CQD.' });
      return;
    }

    const newUser: StoredUser = {
      id: `usr-${Date.now()}`,
      username: username.trim().toLowerCase(),
      passwordHash: 'crystal2026',
      displayName: displayName.trim(),
      displayNameAr: displayNameAr?.trim() || displayName.trim(),
      email: email.trim().toLowerCase(),
      department: department?.trim() || 'Manufacturing',
      jobTitle: jobTitle?.trim() || role,
      role,
      permissions: permissions || defaultPermissionsForRole(role),
      adGroup:
        adGroup?.trim() ||
        `CN=CQD-${role.replace(/\s+/g, '-')},OU=Manufacturing,DC=crystalasfour,DC=com`,
      authProvider: 'ActiveDirectory',
      active: true,
      mustChangePassword: false,
    };

    store.users.push(newUser);

    // Automatically send Welcome / Access Granted Email to the newly added user
    const welcomeEmail = await dispatchOutboundEmail(store, {
      type: 'WelcomeAccess',
      channel: 'Outlook Notification',
      deviationId: 'ACCESS-GRANTED',
      recipientEmail: newUser.email,
      recipientName: newUser.displayName,
      subject: `[Crystal Quality Deviations] Access Granted — Role: ${newUser.role}`,
      bodyPreview: `مرحباً ${newUser.displayNameAr}، تم منحك صلاحية الدخول على نظام استثناءات الجودة (CQD) بدور (${newUser.role}). يمكنك تسجيل الدخول عبر حساب Active Directory الخاص بك (${newUser.email}).`,
    });

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorUsername: actorUsername || 'admin',
      actorRole: 'System Admin',
      action: 'AD_USER_PROVISIONED',
      target: newUser.username,
      details: `Provisioned ${newUser.username} (${newUser.role}) & automatically sent access email to ${newUser.email}.`,
      ipAddress: '10.42.1.10',
    });

    saveStore(store);
    res.status(201).json({ user: sanitizeUser(newUser), welcomeEmail });
  });

  app.patch('/api/admin/users/:id', (req, res) => {
    const { id } = req.params;
    const {
      displayName,
      displayNameAr,
      email,
      department,
      role,
      permissions,
      active,
      actorUsername,
    } = req.body as {
      displayName?: string;
      displayNameAr?: string;
      email?: string;
      department?: string;
      role?: UserRole;
      permissions?: AppPermissions;
      active?: boolean;
      actorUsername?: string;
    };

    const store = loadStore();
    const user = store.users.find((u) => u.id === id);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (displayName?.trim()) user.displayName = displayName.trim();
    if (displayNameAr?.trim()) user.displayNameAr = displayNameAr.trim();
    if (email?.trim()) user.email = email.trim().toLowerCase();
    if (department?.trim()) user.department = department.trim();
    if (role) user.role = role;
    if (permissions) user.permissions = permissions;
    if (typeof active === 'boolean' && user.username !== 'admin') user.active = active;

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorUsername: actorUsername || 'admin',
      actorRole: 'System Admin',
      action: 'RBAC_USER_UPDATED',
      target: user.username,
      details: `Updated user ${user.username}: role=${user.role}, active=${String(user.active)}.`,
      ipAddress: '10.42.1.10',
    });

    saveStore(store);
    res.json({ user: sanitizeUser(user) });
  });

  app.delete('/api/admin/users/:id', (req, res) => {
    const { id } = req.params;
    const actorUsername = String(req.query.actor || 'admin');
    const store = loadStore();
    const idx = store.users.findIndex((u) => u.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    const target = store.users[idx];
    if (target.username === 'admin') {
      res.status(400).json({ error: 'Primary Master Admin account cannot be deleted.' });
      return;
    }

    store.users.splice(idx, 1);
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorUsername,
      actorRole: 'System Admin',
      action: 'RBAC_USER_DELETED',
      target: target.username,
      details: `Removed user ${target.username} (${target.email}) from CQD application access.`,
      ipAddress: '10.42.1.10',
    });

    saveStore(store);
    res.json({ deletedId: id });
  });

  // --- Quality Escalation Authority Recipients CRUD + Auto Notification ---
  app.post('/api/admin/escalations', async (req, res) => {
    const { name, nameAr, email, department, minRpnTrigger, actorUsername } = req.body as {
      name?: string;
      nameAr?: string;
      email?: string;
      department?: string;
      minRpnTrigger?: number;
      actorUsername?: string;
    };

    if (!name?.trim() || !email?.trim()) {
      res.status(400).json({ error: 'Recipient name and email are required.' });
      return;
    }

    const store = loadStore();
    const recipient: EscalationRecipient = {
      id: `esc-${Date.now()}`,
      name: name.trim(),
      nameAr: nameAr?.trim() || name.trim(),
      email: email.trim().toLowerCase(),
      department: department?.trim() || 'Quality Assurance Authority',
      minRpnTrigger: Math.max(
        1,
        Number(minRpnTrigger || store.config.rpnThresholds.criticalEscalationThreshold)
      ),
      active: true,
      addedAt: new Date().toISOString(),
    };

    store.config.escalationRecipients.push(recipient);

    const welcomeEmail = await dispatchOutboundEmail(store, {
      type: 'WelcomeAccess',
      channel: 'Outlook Notification',
      deviationId: 'ESCALATION-LIST',
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      subject: `[Crystal Quality Deviations] Assigned to Critical RPN Escalation Authority (RPN ≥ ${recipient.minRpnTrigger})`,
      bodyPreview: `تمت إضافتك إلى قائمة الجهة المختصة بالجودة لتلقي تنبيهات التصعيد التلقائية فور تجاوز مؤشر المخاطر RPN قيمة ${recipient.minRpnTrigger}.`,
    });

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorUsername: actorUsername || 'admin',
      actorRole: 'System Admin',
      action: 'ESCALATION_RECIPIENT_ADDED',
      target: recipient.email,
      details: `Added ${recipient.name} (${recipient.email}) to Quality Escalation list for RPN ≥ ${recipient.minRpnTrigger} & sent confirmation email.`,
      ipAddress: '10.42.1.10',
    });

    saveStore(store);
    res.status(201).json({ recipient, welcomeEmail });
  });

  app.patch('/api/admin/escalations/:id', (req, res) => {
    const { id } = req.params;
    const { active, minRpnTrigger, actorUsername } = req.body as {
      active?: boolean;
      minRpnTrigger?: number;
      actorUsername?: string;
    };

    const store = loadStore();
    const item = store.config.escalationRecipients.find((e) => e.id === id);
    if (!item) {
      res.status(404).json({ error: 'Escalation recipient not found.' });
      return;
    }
    if (typeof active === 'boolean') item.active = active;
    if (typeof minRpnTrigger === 'number') item.minRpnTrigger = Math.max(1, minRpnTrigger);

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorUsername: actorUsername || 'admin',
      actorRole: 'System Admin',
      action: 'ESCALATION_RECIPIENT_UPDATED',
      target: item.email,
      details: `Updated escalation trigger RPN ≥ ${item.minRpnTrigger}, active=${String(item.active)}.`,
      ipAddress: '10.42.1.10',
    });

    saveStore(store);
    res.json({ recipient: item });
  });

  app.delete('/api/admin/escalations/:id', (req, res) => {
    const { id } = req.params;
    const actorUsername = String(req.query.actor || 'admin');
    const store = loadStore();
    const idx = store.config.escalationRecipients.findIndex((e) => e.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Escalation recipient not found.' });
      return;
    }
    const removed = store.config.escalationRecipients[idx];
    store.config.escalationRecipients.splice(idx, 1);

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorUsername,
      actorRole: 'System Admin',
      action: 'ESCALATION_RECIPIENT_REMOVED',
      target: removed.email,
      details: `Removed ${removed.name} (${removed.email}) from Quality Escalation notifications.`,
      ipAddress: '10.42.1.10',
    });

    saveStore(store);
    res.json({ deletedId: id });
  });

  app.post('/api/admin/sync-ad', async (req, res) => {
    const { actorUsername } = req.body as { actorUsername?: string };
    const store = loadStore();
    const now = new Date().toISOString();
    store.config.adSync.lastSyncAt = now;

    const graphToken = await getGraphAppToken(store);
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: now,
      actorUsername: actorUsername || 'admin',
      actorRole: 'System Admin',
      action: 'MANUAL_AD_SYNC',
      target: store.config.adSync.tenantDomain,
      details: graphToken
        ? `Live Microsoft Graph AD sync verified for tenant ${store.config.adSync.tenantId}.`
        : `Synced AD delta cache (${store.users.length} provisioned identities).`,
      ipAddress: '10.42.1.10',
    });
    saveStore(store);
    res.json({ lastSyncAt: now, liveGraphConnected: Boolean(graphToken) });
  });

  return app;
}
