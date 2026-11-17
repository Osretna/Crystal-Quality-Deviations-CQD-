import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import type { Language } from '../types';
import { getText } from '../i18n';

interface ArchitectureViewProps {
  lang: Language;
}

type DeliverableTab = 'ui-ux' | 'schema' | 'power-automate' | 'ad-setup' | 'rbac' | 'vercel-deploy';

const ADAPTIVE_CARD_JSON = `{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.4",
  "originator": "crystal-asfour-cqd-provider-id",
  "body": [
    {
      "type": "Container",
      "style": "emphasis",
      "items": [
        {
          "type": "TextBlock",
          "text": "CRYSTAL ASFOUR INTERNATIONAL · QUALITY DEVIATION",
          "weight": "Bolder",
          "size": "Small",
          "color": "Accent"
        },
        {
          "type": "TextBlock",
          "text": "@{triggerOutputs()?['body/DeviationCode']} — @{triggerOutputs()?['body/Title']}",
          "weight": "Bolder",
          "size": "Large",
          "wrap": true
        }
      ]
    },
    {
      "type": "FactSet",
      "facts": [
        { "title": "Model", "value": "@{triggerOutputs()?['body/ModelLookup/Code']}" },
        { "title": "Stage", "value": "@{triggerOutputs()?['body/StageLookup/Title']}" },
        { "title": "Quantity", "value": "@{triggerOutputs()?['body/Quantity']} pcs" },
        { "title": "RPN Score", "value": "@{triggerOutputs()?['body/RPN']} (S:@{triggerOutputs()?['body/Severity']} × O:@{triggerOutputs()?['body/Occurrence']} × D:@{triggerOutputs()?['body/Detection']})" }
      ]
    },
    {
      "type": "Input.Text",
      "id": "managerComment",
      "isMultiline": true,
      "placeholder": "اكتب ملاحظاتك (مثال: موافق، بشرط فحص 100% قبل التعليق)"
    }
  ],
  "actions": [
    {
      "type": "Action.Http",
      "title": "Approve",
      "method": "POST",
      "url": "https://prod-xx.westeurope.logic.azure.com/workflows/.../approve",
      "body": "{ \\"id\\": \\"@{triggerOutputs()?['body/ID']}\\", \\"decision\\": \\"Approved\\", \\"comment\\": \\"{{managerComment.value}}\\" }"
    },
    {
      "type": "Action.Http",
      "title": "Reject",
      "method": "POST",
      "url": "https://prod-xx.westeurope.logic.azure.com/workflows/.../reject",
      "body": "{ \\"id\\": \\"@{triggerOutputs()?['body/ID']}\\", \\"decision\\": \\"Rejected\\", \\"comment\\": \\"{{managerComment.value}}\\" }"
    }
  ]
}`;

const SHAREPOINT_COLUMNS = [
  { list: 'CQD_Deviations', internal: 'DeviationCode', type: 'Single line of text (Indexed, Unique)', notes: 'Auto-populated by Power Automate: DEV-YYYY-XXXX' },
  { list: 'CQD_Deviations', internal: 'Title', type: 'Single line of text (Required)', notes: 'Short deviation headline (العنوان)' },
  { list: 'CQD_Deviations', internal: 'Description', type: 'Multiple lines of text (Plain)', notes: 'Detailed defect observations (الوصف)' },
  { list: 'CQD_Deviations', internal: 'ModelLookup', type: 'Lookup → CQD_ChandelierModels', notes: 'Links CH-2041, AS-9012 with collection metadata' },
  { list: 'CQD_Deviations', internal: 'StageLookup', type: 'Lookup → CQD_ProductionStages', notes: 'Determines routing approver email automatically' },
  { list: 'CQD_Deviations', internal: 'AffectedQuantity', type: 'Number (Integer, Min 1)', notes: 'Affected pieces count (الكمية)' },
  { list: 'CQD_Deviations', internal: 'SeverityScore / OccurrenceScore / DetectionScore', type: 'Number (1–10)', notes: 'FMEA RPN input factors' },
  { list: 'CQD_Deviations', internal: 'RPNScore', type: 'Calculated (=Severity*Occurrence*Detection)', notes: 'Indexed numeric score (1–1000)' },
  { list: 'CQD_Deviations', internal: 'InspectionPhotos', type: 'SharePoint Document Library / Attachments', notes: 'Compressed JPEG ≤ 350 KB from Power Apps Camera' },
  { list: 'CQD_Deviations', internal: 'ApprovalStatus', type: 'Choice (Pending, Approved, Rejected)', notes: 'Indexed status column; default Pending' },
  { list: 'CQD_Deviations', internal: 'ManagerComment', type: 'Multiple lines of text', notes: 'Populated via Outlook Actionable Card' },
  { list: 'CQD_Deviations', internal: 'RequesterAccount / ApproverAccount', type: 'Person or Group (AD Bound)', notes: 'Claims-based Active Directory identity' },
];

export function ArchitectureView({ lang }: ArchitectureViewProps) {
  const t = getText(lang);
  const [tab, setTab] = useState<DeliverableTab>('ui-ux');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function copySnippet(key: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0F1E3D]">{t.arch.heading}</h1>
        <p className="text-sm text-[#475569] mt-1">{t.arch.subheading}</p>
      </div>

      {/* 5 Deliverables Tab Navigation */}
      <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#E9EFF7] rounded-lg">
        {(
          [
            { key: 'ui-ux', label: lang === 'ar' ? '١. مواصفات الواجهات UI/UX' : '01. UI/UX Wireframes' },
            { key: 'schema', label: lang === 'ar' ? '٢. جداول SharePoint و DB' : '02. SharePoint & DB Schema' },
            { key: 'power-automate', label: lang === 'ar' ? '٣. منطق Power Automate' : '03. Power Automate & JSON' },
            { key: 'ad-setup', label: lang === 'ar' ? '٤. دليل ربط Active Directory' : '04. AD & Admin Setup Guide' },
            { key: 'rbac', label: lang === 'ar' ? '٥. مصفوفة الصلاحيات RBAC' : '05. Security & RBAC Matrix' },
            { key: 'vercel-deploy', label: lang === 'ar' ? '٦. النشر على GitHub و Vercel' : '06. GitHub + Vercel + AD Deploy' },
          ] as { key: DeliverableTab; label: string }[]
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              tab === item.key
                ? 'bg-white text-[#0F1E3D]'
                : 'text-[#475569] hover:text-[#0F1E3D]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Deliverable 1: UI/UX Specification */}
      {tab === 'ui-ux' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 bg-white border border-[#DCE4F0] rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-[#0F1E3D]">
              Mobile Canvas App Wireframe (390×844 · Power Apps)
            </h2>
            <p className="text-xs text-[#475569] leading-relaxed">
              Optimized for gloved factory operators and QC inspectors using single-handed thumb ergonomics with ≥44px touch targets and offline draft caching.
            </p>
            <div className="border-2 border-[#0F1E3D] rounded-2xl p-4 bg-[#F4F7FB] space-y-3 font-mono text-[11px] text-[#0F1E3D]">
              <div className="bg-[#0F1E3D] text-white p-2.5 rounded-lg flex justify-between">
                <span>CQD Field Capture</span>
                <span className="text-[#E0AC46]">AD: m.hassan</span>
              </div>
              <div className="bg-white border border-[#CBD5E1] p-2.5 rounded-lg">
                [1] Title + Detailed Defect Description
              </div>
              <div className="bg-white border border-[#CBD5E1] p-2.5 rounded-lg">
                [2] Searchable Model ComboBox (CH-2041)
              </div>
              <div className="bg-white border border-[#CBD5E1] p-2.5 rounded-lg">
                [3] Stage Touch Grid (2×3 Buttons ≥44px)
              </div>
              <div className="bg-white border border-[#CBD5E1] p-2.5 rounded-lg">
                [4] Qty Stepper [-] [12] [+] · S × O × D = RPN
              </div>
              <div className="bg-white border border-[#CBD5E1] p-2.5 rounded-lg">
                [5] Camera Control → Resize(1024px) JPEG
              </div>
              <div className="bg-[#0F1E3D] text-[#E0AC46] text-center font-bold p-3 rounded-xl">
                [ Sticky Bottom CTA: حفظ وإرسال / Save & Submit ]
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 bg-white border border-[#DCE4F0] rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-[#0F1E3D]">
              Desktop Web View Architecture (1440px · SharePoint & Admin)
            </h2>
            <p className="text-xs text-[#475569] leading-relaxed">
              Built on Crystal Asfour’s Royal Navy (#0F1E3D) & Crystal Gold (#C8922B) visual system over an Ice-Blue (#F4F7FB) canvas with tabular numerals and Cairo/Plus Jakarta Sans typography.
            </p>
            <div className="border border-[#CBD5E1] rounded-xl p-4 bg-[#F4F7FB] space-y-3 font-mono text-[11px] text-[#0F1E3D]">
              <div className="bg-white border border-[#CBD5E1] p-2.5 rounded-lg flex justify-between">
                <span>Brand: CQD</span>
                <span>Nav: Field Log · Grid · Outlook · Admin · Specs</span>
                <span>[ + Log Deviation ]</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-white border border-[#CBD5E1] p-2 rounded">Total KPI</div>
                <div className="bg-white border border-[#CBD5E1] p-2 rounded">Pending KPI</div>
                <div className="bg-white border border-[#CBD5E1] p-2 rounded">Critical RPN</div>
                <div className="bg-white border border-[#CBD5E1] p-2 rounded">Approval %</div>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-8 bg-white border border-[#CBD5E1] p-4 rounded-lg min-h-[140px]">
                  Master SharePoint Data Grid (DEV-YYYY-XXXX, Model, Stage, Qty, RPN, Status)
                </div>
                <div className="col-span-4 bg-white border border-[#CBD5E1] p-4 rounded-lg min-h-[140px]">
                  Inspection Dossier + Compressed Photo + Manager Notes
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deliverable 2: SharePoint & Database Schema */}
      {tab === 'schema' && (
        <div className="bg-white border border-[#DCE4F0] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E2E8F0]">
            <h2 className="text-sm font-bold text-[#0F1E3D]">
              SharePoint Online Lists & Lookup Relationships (Microsoft 365 E3/F3)
            </h2>
            <p className="text-xs text-[#64748B] mt-1">
              Indexed columns (`DeviationCode`, `ApprovalStatus`, `RPNScore`) guarantee zero throttling past the 5,000-item SharePoint threshold.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-semibold text-[#475569]">
                  <th className="py-3 px-4 text-start">List Name</th>
                  <th className="py-3 px-4 text-start">Internal Column</th>
                  <th className="py-3 px-4 text-start">SharePoint Data Type</th>
                  <th className="py-3 px-4 text-start">Purpose & Indexing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {SHAREPOINT_COLUMNS.map((col) => (
                  <tr key={col.internal} className="hover:bg-[#F8FAFC]">
                    <td className="py-3 px-4 font-mono text-[#1F3B73] whitespace-nowrap">
                      {col.list}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-[#0F1E3D] whitespace-nowrap">
                      {col.internal}
                    </td>
                    <td className="py-3 px-4 text-[#334155]">{col.type}</td>
                    <td className="py-3 px-4 text-[#475569]">{col.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Deliverable 3: Power Automate & Adaptive Card JSON */}
      {tab === 'power-automate' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 bg-white border border-[#DCE4F0] rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-[#0F1E3D]">
              Power Automate Flow Execution Sequence
            </h2>
            <ol className="space-y-3 text-xs text-[#334155]">
              <li className="pb-3 border-b border-[#F1F5F9]">
                <span className="font-mono font-bold text-[#0F1E3D]">01. Trigger:</span> SharePoint —{' '}
                <em>When an item is created</em> in <code className="font-mono">CQD_Deviations</code>.
              </li>
              <li className="pb-3 border-b border-[#F1F5F9]">
                <span className="font-mono font-bold text-[#0F1E3D]">02. Auto-Numbering:</span>{' '}
                Compose expression:{' '}
                <code className="font-mono text-[#1F3B73]">
                  concat(&apos;DEV-&apos;, formatDateTime(utcNow(), &apos;yyyy&apos;), &apos;-&apos;, formatNumber(triggerOutputs()?[&apos;body/ID&apos;], &apos;0000&apos;))
                </code>
              </li>
              <li className="pb-3 border-b border-[#F1F5F9]">
                <span className="font-mono font-bold text-[#0F1E3D]">03. Escalation Check:</span>{' '}
                Condition <code className="font-mono">RPNScore &gt;= 120</code> → append Quality Director to CC list.
              </li>
              <li className="pb-3 border-b border-[#F1F5F9]">
                <span className="font-mono font-bold text-[#0F1E3D]">04. Dispatch Actionable Card:</span>{' '}
                Send Outlook Adaptive Card + Microsoft Teams Adaptive Card with inline comment box and Approve/Reject HTTP endpoints.
              </li>
              <li>
                <span className="font-mono font-bold text-[#0F1E3D]">05. Final Feedback Loop:</span>{' '}
                HTTP Trigger receives manager decision → updates SharePoint <code className="font-mono">ApprovalStatus</code> &amp; <code className="font-mono">ManagerComment</code> → emails final decision to <code className="font-mono">RequesterAccount</code>.
              </li>
            </ol>
          </div>

          <div className="lg:col-span-7 bg-white border border-[#DCE4F0] rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
              <span className="text-xs font-bold text-[#0F1E3D]">
                Outlook Actionable Message Adaptive Card Payload (JSON)
              </span>
              <button
                type="button"
                onClick={() => copySnippet('adaptive-card', ADAPTIVE_CARD_JSON)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1F3B73] hover:underline"
              >
                {copiedKey === 'adaptive-card' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#15803D]" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy JSON</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-4 text-[11px] font-mono text-[#0F1E3D] overflow-x-auto leading-relaxed bg-[#F8FAFC]">
              {ADAPTIVE_CARD_JSON}
            </pre>
          </div>
        </div>
      )}

      {/* Deliverable 4: Active Directory & Admin Setup Guide */}
      {tab === 'ad-setup' && (
        <div className="bg-white border border-[#DCE4F0] rounded-xl p-6 space-y-5 max-w-4xl">
          <h2 className="text-base font-bold text-[#0F1E3D]">
            Active Directory Integration &amp; Master Admin Deployment Checklist
          </h2>
          <div className="space-y-4 text-xs text-[#334155] leading-relaxed">
            <div className="p-4 rounded-lg bg-[#F4F7FB] border border-[#DCE4F0]">
              <h3 className="font-bold text-[#0F1E3D]">
                1. Microsoft Entra ID (Azure AD) &amp; On-Premises AD Connect
              </h3>
              <p className="mt-1">
                Synchronize <code className="font-mono">corp.crystalasfour.com</code> OU groups via Azure AD Connect (15-minute delta sync over LDAPS port 636). Power Apps Canvas &amp; SharePoint Online authenticate users natively via M365 OAuth 2.0 / SAML 2.0 SSO with zero extra per-user middleware cost.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-[#F4F7FB] border border-[#DCE4F0]">
              <h3 className="font-bold text-[#0F1E3D]">
                2. Required AD Security Groups
              </h3>
              <ul className="mt-1.5 space-y-1 font-mono text-[11px] text-[#1F3B73]">
                <li>CN=CQD-Floor-Operators,OU=Manufacturing,DC=crystalasfour,DC=com</li>
                <li>CN=CQD-QC-Inspectors,OU=Quality,DC=crystalasfour,DC=com</li>
                <li>CN=CQD-Prod-Managers,OU=Operations,DC=crystalasfour,DC=com</li>
                <li>CN=CQD-Quality-Directors,OU=Executive,DC=crystalasfour,DC=com</li>
                <li>CN=CQD-Master-Admins,OU=IT,DC=crystalasfour,DC=com</li>
              </ul>
            </div>
            <div className="p-4 rounded-lg bg-[#FCF8EE] border border-[#E5C98B]">
              <h3 className="font-bold text-[#0F1E3D]">
                3. Default Master Admin Security Hardening (admin / admin1234)
              </h3>
              <p className="mt-1">
                Initial deployment provisions <code className="font-mono font-bold">admin</code> with temporary password{' '}
                <code className="font-mono font-bold">admin1234</code> and flag{' '}
                <code className="font-mono">mustChangePassword = true</code>. On first login, the Master Admin Control Panel locks all navigation until a compliant 8+ character password is set and recorded in the immutable audit log.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Deliverable 5: RBAC Security & Permission Mapping */}
      {tab === 'rbac' && (
        <div className="bg-white border border-[#DCE4F0] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E2E8F0]">
            <h2 className="text-sm font-bold text-[#0F1E3D]">
              Role-Based Access Control (RBAC) &amp; SharePoint Item-Level Security
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-semibold text-[#475569]">
                  <th className="py-3 px-4 text-start">Enterprise Role</th>
                  <th className="py-3 px-4 text-start">Create Deviation</th>
                  <th className="py-3 px-4 text-start">Read Scope</th>
                  <th className="py-3 px-4 text-start">Approve / Reject</th>
                  <th className="py-3 px-4 text-start">Admin Panel &amp; Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                <tr>
                  <td className="py-3 px-4 font-bold text-[#0F1E3D]">Operator</td>
                  <td className="py-3 px-4 text-[#15803D] font-semibold">Yes (Mobile App)</td>
                  <td className="py-3 px-4">Own logged deviations only</td>
                  <td className="py-3 px-4 text-[#64748B]">Denied</td>
                  <td className="py-3 px-4 text-[#64748B]">Denied</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-bold text-[#0F1E3D]">Quality Inspector</td>
                  <td className="py-3 px-4 text-[#15803D] font-semibold">Yes (Full RPN + Photo)</td>
                  <td className="py-3 px-4">All deviations (Plant-wide)</td>
                  <td className="py-3 px-4 text-[#64748B]">Read-only</td>
                  <td className="py-3 px-4 text-[#64748B]">Denied</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-bold text-[#0F1E3D]">Production Manager</td>
                  <td className="py-3 px-4 text-[#15803D] font-semibold">Yes</td>
                  <td className="py-3 px-4">Assigned production stages + all</td>
                  <td className="py-3 px-4 text-[#15803D] font-semibold">Yes (Outlook / Web)</td>
                  <td className="py-3 px-4 text-[#64748B]">Denied</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-bold text-[#0F1E3D]">Quality Director</td>
                  <td className="py-3 px-4 text-[#15803D] font-semibold">Yes</td>
                  <td className="py-3 px-4">All plants + Critical RPN alerts</td>
                  <td className="py-3 px-4 text-[#15803D] font-semibold">Yes (Override &amp; Escalations)</td>
                  <td className="py-3 px-4 text-[#A36D0E] font-semibold">Audit Read-Only</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-bold text-[#0F1E3D]">System Admin</td>
                  <td className="py-3 px-4 text-[#15803D] font-semibold">Yes</td>
                  <td className="py-3 px-4">Full System + Schema</td>
                  <td className="py-3 px-4 text-[#64748B]">Governance only</td>
                  <td className="py-3 px-4 text-[#15803D] font-semibold">Full Control (RBAC, AD, Config)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Deliverable 6: GitHub + Vercel + Active Directory Production Deployment */}
      {tab === 'vercel-deploy' && (
        <div className="bg-white border border-[#DCE4F0] rounded-xl p-6 space-y-5 max-w-4xl">
          <h2 className="text-base font-bold text-[#0F1E3D]">
            {lang === 'ar'
              ? 'دليل النشر على GitHub و Vercel والربط الفعلي مع Active Directory'
              : 'GitHub + Vercel Serverless Deployment & Live Entra ID (Active Directory) Wiring'}
          </h2>
          <div className="space-y-4 text-xs text-[#334155] leading-relaxed">
            <div className="p-4 rounded-lg bg-[#F4F7FB] border border-[#DCE4F0]">
              <h3 className="font-bold text-[#0F1E3D]">
                1. Vercel Serverless Routing (`vercel.json` &amp; `api/index.ts`)
              </h3>
              <p className="mt-1">
                The repository already includes <code className="font-mono">vercel.json</code> and{' '}
                <code className="font-mono">api/index.ts</code>. Pushing to GitHub and importing into Vercel automatically builds <code className="font-mono">dist/</code> via Vite and serves all <code className="font-mono">/api/*</code> routes (AD OAuth2, Graph Directory Search, Deviations, Admin CRUD) as Vercel Serverless Functions.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-[#F4F7FB] border border-[#DCE4F0]">
              <h3 className="font-bold text-[#0F1E3D]">
                2. Azure Portal / Microsoft Entra ID App Registration
              </h3>
              <ul className="mt-1.5 space-y-1 list-disc list-inside">
                <li>
                  Register a new App in Azure Portal → Entra ID → App Registrations (e.g.{' '}
                  <code className="font-mono">Crystal-Quality-Deviations</code>).
                </li>
                <li>
                  Add Web Redirect URI:{' '}
                  <code className="font-mono text-[#1F3B73]">
                    https://YOUR-VERCEL-DOMAIN.vercel.app/api/auth/azure/callback
                  </code>
                </li>
                <li>
                  Grant Microsoft Graph permissions: <code className="font-mono">User.Read</code>{' '}
                  (Delegated), <code className="font-mono">User.Read.All</code> (Application, for AD People Search), and <code className="font-mono">Mail.Send</code> (Application, for automated Outlook emails).
                </li>
              </ul>
            </div>
            <div className="p-4 rounded-lg bg-[#FCF8EE] border border-[#E5C98B]">
              <h3 className="font-bold text-[#0F1E3D]">
                3. Vercel Environment Variables (or Master Admin Panel Input)
              </h3>
              <p className="mt-1">
                IT Admin can paste these variables either in Vercel → Project Settings → Environment Variables OR directly inside the Master Admin Panel → AD Search &amp; Users RBAC tab:
              </p>
              <pre className="mt-2 p-3 rounded bg-white border border-[#E5C98B] font-mono text-[11px] text-[#0F1E3D] overflow-x-auto">
{`AZURE_AD_TENANT_ID="your-crystal-asfour-tenant-id"
AZURE_AD_CLIENT_ID="your-app-client-id"
AZURE_AD_CLIENT_SECRET="your-app-client-secret"
GRAPH_SENDER_EMAIL="cqd-noreply@crystalasfour.com"
POWER_AUTOMATE_WEBHOOK_URL="https://prod-xx.westeurope.logic.azure.com/..."`}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
