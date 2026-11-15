import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Building2,
  CheckCircle2,
  Copy,
  FileText,
  History,
  Lock,
  LogOut,
  Plus,
  Rocket,
  Save,
  Settings,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useI18n } from '../../i18n';
import {
  AdminAccountSummary,
  DashboardAnalyticsSummary,
  FormBuilderForm,
  FormBuilderQuestion,
  FormBuilderSection,
  FormCategory,
  FormQuestionType,
  FormSubmissionRecord,
  FormVersionRecord,
  OrganizationRecord,
  OrganizationType,
  PrivateSupportRecord,
  SupportedLanguage,
} from '../../types/gateway';
import { adminApi, AdminApiError } from '../../services/api/adminApi';
import { AdminAccountSettingsPanel } from './AdminAccountSettingsPanel';
import { isStrongAdminPassword } from './AdminCredentialSetupPage';

type WorkspaceTab = 'forms' | 'organizations' | 'submissions' | 'analytics' | 'settings';

interface FormBuilderWorkspaceProps {
  admin: AdminAccountSummary;
  initialNotice?: string | null;
  onAdminUpdated: (nextAdmin: AdminAccountSummary, notice?: string) => void;
  onSessionExpired: (message: string) => void;
  onLogout: () => Promise<void>;
  onOpenPublicForm: (formId: string) => void;
}

const QUESTION_TYPES: FormQuestionType[] = [
  'text',
  'email',
  'phone',
  'number',
  'date',
  'dropdown',
  'radio',
  'checkbox',
  'yes_no',
  'file',
  'address',
  'consent',
];

const ORG_TYPES: OrganizationType[] = [
  'university',
  'ngo',
  'company',
  'employer',
  'training_institution',
  'career_platform',
];

function emptyLocalized(en = '', am = '', om = '') {
  return { en, am: am || en, om: om || en };
}

function makeTemplateForm(
  templateKey: 'learner_intake' | 'employer_survey' | 'workshop_feedback',
  organization: OrganizationRecord
): Partial<FormBuilderForm> & { organizationId: string } {
  const sec1Id = `sec-${Date.now()}-1`;
  const sec2Id = `sec-${Date.now()}-2`;

  if (templateKey === 'learner_intake') {
    return {
      organizationId: organization.id,
      slug: `learner-intake-${Date.now().toString().slice(-4)}`,
      type: 'onboarding',
      title: {
        en: `${organization.name} Accessible Learner Intake`,
        am: `${organization.name} ተደራሽ የተማሪ ምዝገባ`,
        om: `Galmee Barataa Dhaqqabamaa ${organization.name}`,
      },
      description: {
        en: 'Dignified intake collecting contact preferences, skills goals, and optional adjustments.',
        am: 'የመገናኛ ምርጫዎችን እና የድጋፍ ፍላጎቶችን በሚስጥር የሚሰበስብ ቅጽ።',
        om: 'Unka fedhii quunnamtii fi deeggarsaa iccitiidhaan walitti qabu.',
      },
      submitLabel: { en: 'Submit Intake', am: 'ቅጹን አስገባ', om: 'Galmee Ergi' },
      doneMessage: {
        en: 'Thank you. Your accessible intake has been recorded securely.',
        am: 'እናመሰግናለን። ምዝገባዎ በደህንነት ተቀምጧል።',
        om: 'Galatoomaa. Galmeen keessan nageenyaan kuufameera.',
      },
      branding: { ...organization.branding },
      sections: [
        {
          id: sec1Id,
          sortOrder: 0,
          title: emptyLocalized('Learner Contact & Goals', 'የተማሪ መገናኛ እና ግቦች', 'Quunnamtii fi Kaayyoo Barataa'),
          description: emptyLocalized('Basic reachability details.', 'መሰረታዊ የመገናኛ መረጃ።', 'Odeeffannoo quunnamtii buʼuuraa.'),
        },
        {
          id: sec2Id,
          sortOrder: 1,
          title: emptyLocalized('Accessibility Preferences & Consent', 'የተደራሽነት ምርጫ እና ፈቃድ', 'Filannoo Dhaqqabummaa fi Eeyyama'),
          description: emptyLocalized('Optional support adjustments.', 'አማራጭ የድጋፍ ማስተካከያዎች።', 'Sirreeffama deeggarsaa filannoo.'),
        },
      ],
      questions: [
        {
          id: `q-${Date.now()}-1`,
          sectionId: sec1Id,
          fieldKey: 'full_name',
          sortOrder: 0,
          questionType: 'text',
          label: emptyLocalized('Full name', 'ሙሉ ስም', 'Maqaa guutuu'),
          helpText: emptyLocalized('Enter the name you prefer to use.', 'መጠራት የሚፈልጉትን ስም ያስገቡ።', 'Maqaa waamamuu barbaaddan galchaa.'),
          whyWeAsk: emptyLocalized('So coordinators address you respectfully.', 'አስተባባሪዎች በአክብሮት እንዲጠሩዎት።', 'Qindeessitoonni kabajaan akka isin waamaniif.'),
          placeholder: emptyLocalized('Abebe Bikila', 'አበበ ቢቂላ', 'Abebe Bikila'),
          required: true,
          sensitive: false,
          options: [],
          validation: { minLength: 2, maxLength: 120 },
          conditionalLogic: null,
        },
        {
          id: `q-${Date.now()}-2`,
          sectionId: sec1Id,
          fieldKey: 'phone_number',
          sortOrder: 1,
          questionType: 'phone',
          label: emptyLocalized('Phone number', 'ስልክ ቁጥር', 'Lakkoofsa bilbilaa'),
          helpText: emptyLocalized('Ethiopian mobile format or local contact.', 'የኢትዮጵያ ስልክ ቁጥር (+251...).', 'Lakkoofsa bilbilaa (+251...).'),
          whyWeAsk: emptyLocalized('To send workshop updates.', 'የስልጠና መረጃዎችን ለመላክ።', 'Odeeffannoo leenjii erguuf.'),
          placeholder: emptyLocalized('+251911234567'),
          required: true,
          sensitive: false,
          options: [],
          validation: {},
          conditionalLogic: null,
        },
        {
          id: `q-${Date.now()}-3`,
          sectionId: sec2Id,
          fieldKey: 'needs_adjustment',
          sortOrder: 2,
          questionType: 'yes_no',
          label: emptyLocalized('Do you want learning format adjustments?', 'የመማሪያ ቅርጸት ማስተካከያ ይፈልጋሉ?', 'Sirreeffama haala barnootaa barbaadduu?'),
          helpText: emptyLocalized('Select yes to specify options.', 'አማራጮችን ለመምረጥ አዎ የሚለውን ይምረጡ።', 'Filannoowwan argachuuf Eeyyee filadhaa.'),
          whyWeAsk: emptyLocalized('Helps us prepare accessible materials early.', 'ተደራሽ ቁሳቁሶችን ቀድመን ለማዘጋጀት።', 'Meeshaalee dhaqqabamaa dursee qopheessuuf.'),
          placeholder: emptyLocalized(),
          required: false,
          sensitive: true,
          options: [],
          validation: {},
          conditionalLogic: null,
        },
        {
          id: `q-${Date.now()}-4`,
          sectionId: sec2Id,
          fieldKey: 'preferred_formats',
          sortOrder: 3,
          questionType: 'checkbox',
          label: emptyLocalized('Preferred accessible formats', 'ተመራጭ የተደራሽነት ቅርጸቶች', 'Bifa dhaqqabamaa filataman'),
          helpText: emptyLocalized('Select any formats that help you.', 'የሚረዱዎትን ቅርጸቶች ይምረጡ።', 'Kan isin gargaaru hunda filadhaa.'),
          whyWeAsk: emptyLocalized('Stored privately for facilitator preparation.', 'ለአሰልጣኝ ዝግጅት በሚስጥር ይቀመጣል።', 'Qophii barsiisaa qofaaf iccitiidhaan kuufama.'),
          placeholder: emptyLocalized(),
          required: false,
          sensitive: true,
          options: [
            { value: 'screen_reader', label: emptyLocalized('Screen reader friendly digital text', 'ለስክሪን አንባቢ ተስማሚ ጽሑፍ', 'Barreeffama dubbisa iskiriiniif mijatu') },
            { value: 'large_print', label: emptyLocalized('Large print / Easy Read', 'ትልቅ ጽሑፍ / ቀላል ንባብ', 'Maxxansa guddaa / Dubbisa salphaa') },
            { value: 'captions_sign', label: emptyLocalized('Captions or sign language support', 'የጽሑፍ መግለጫ ወይም የምልክት ቋንቋ', 'Ibsa barreeffamaa ykn afaan mallattoo') },
          ],
          validation: {},
          conditionalLogic: { dependsOnKey: 'needs_adjustment', operator: 'equals', value: 'yes' },
        },
        {
          id: `q-${Date.now()}-5`,
          sectionId: sec2Id,
          fieldKey: 'privacy_consent',
          sortOrder: 4,
          questionType: 'consent',
          label: emptyLocalized('Consent to process intake', 'መረጃን ለመጠቀም ፈቃድ', 'Eeyyama itti fayyadama odeeffannoo'),
          helpText: emptyLocalized('I consent to share these intake answers only with authorized coordinators.', 'እነዚህን መልሶች ከተፈቀደላቸው አስተባባሪዎች ጋር ብቻ ለመጋራት ፈቅጃለሁ።', 'Deebii kana qindeessitoota eeyyamaman qofa waliin qooduuf nan eeyyama.'),
          whyWeAsk: emptyLocalized('Required under privacy-first governance.', 'በግላዊነት ጥበቃ መመሪያ መሰረት አስፈላጊ ነው።', 'Akkaataa imaammata iccitii eeguutiin barbaachisaadha.'),
          placeholder: emptyLocalized(),
          required: true,
          sensitive: false,
          options: [],
          validation: {},
          conditionalLogic: null,
        },
      ],
    };
  }

  if (templateKey === 'employer_survey') {
    return {
      organizationId: organization.id,
      slug: `employer-access-${Date.now().toString().slice(-4)}`,
      type: 'career',
      title: {
        en: `${organization.name} Inclusive Workplace Readiness`,
        am: `${organization.name} የስራ ቦታ ተደራሽነት ዳሰሳ`,
        om: `Qorannoo Qophii Hojii Dhaqqabamaa ${organization.name}`,
      },
      description: {
        en: 'Standardized workplace accessibility onboarding for partner employers.',
        am: 'ለአጋር ቀጣሪዎች የስራ ቦታ ተደራሽነት መመዝገቢያ።',
        om: 'Galmee dhaqqabummaa bakka hojii qacartoota michuutiif.',
      },
      submitLabel: { en: 'Save Readiness Profile', am: 'መገለጫውን አስቀምጥ', om: 'Ibsa Qophii Kuusi' },
      doneMessage: {
        en: 'Workplace accessibility readiness saved.',
        am: 'የስራ ቦታ ተደራሽነት መረጃ ተቀምጧል።',
        om: 'Odeeffannoon qophii bakka hojii kuufameera.',
      },
      branding: { ...organization.branding },
      sections: [
        {
          id: sec1Id,
          sortOrder: 0,
          title: emptyLocalized('Organization & Contact', 'ድርጅት እና መገናኛ', 'Dhaabbata fi Quunnamtii'),
          description: emptyLocalized('Employer hiring contact.', 'የቀጣሪ መገናኛ።', 'Quunnamtii qacaraa.'),
        },
      ],
      questions: [
        {
          id: `q-${Date.now()}-1`,
          sectionId: sec1Id,
          fieldKey: 'company_email',
          sortOrder: 0,
          questionType: 'email',
          label: emptyLocalized('Hiring team email', 'የቅጥር ቡድን ኢሜይል', 'Imeelii garee qacarrii'),
          helpText: emptyLocalized('Official workplace contact address.', 'የድርጅቱ ኦፊሴላዊ ኢሜይል።', 'Teessoo imeelii dhaabbataa.'),
          whyWeAsk: emptyLocalized('To send candidate accommodation summaries.', 'የተመራጭ እጩዎችን ማስተካከያ ለመላክ።', 'Cuunfaa sirreeffamaa erguuf.'),
          placeholder: emptyLocalized('talent@company.org'),
          required: true,
          sensitive: false,
          options: [],
          validation: {},
          conditionalLogic: null,
        },
        {
          id: `q-${Date.now()}-2`,
          sectionId: sec1Id,
          fieldKey: 'work_mode',
          sortOrder: 1,
          questionType: 'dropdown',
          label: emptyLocalized('Primary work arrangement', 'ዋና የስራ ሁኔታ', 'Haala hojii ijoo'),
          helpText: emptyLocalized('Select arrangement supported for roles.', 'ለስራዎቹ የሚደገፈውን ሁኔታ ይምረጡ።', 'Haala hojii deeggaramu filadhaa.'),
          whyWeAsk: emptyLocalized('Helps candidates filter matching roles privately.', 'እጩዎች ተስማሚ ስራዎችን በግላቸው እንዲመርጡ።', 'Kaadhimamtoonni hojii mijataa iccitiin akka filataniif.'),
          placeholder: emptyLocalized(),
          required: true,
          sensitive: false,
          options: [
            { value: 'remote', label: emptyLocalized('Full Remote', 'ሙሉ በርቀት', 'Hojii fagoo guutuu') },
            { value: 'hybrid', label: emptyLocalized('Hybrid Flexible', 'ድብልቅ ተለዋዋጭ', 'Makaa jijjiiramaa') },
            { value: 'onsite_step_free', label: emptyLocalized('Step-free Onsite', 'ደረጃ-አልባ በአካል', 'Bakka hojii gufuu hin qabne') },
          ],
          validation: {},
          conditionalLogic: null,
        },
      ],
    };
  }

  return {
    organizationId: organization.id,
    slug: `workshop-feedback-${Date.now().toString().slice(-4)}`,
    type: 'feedback',
    title: emptyLocalized(`${organization.name} Accessibility Feedback`, `${organization.name} የተደራሽነት ግብረመልስ`, `Yaada Dhaqqabummaa ${organization.name}`),
    description: emptyLocalized('Collect accessible feedback after learning events.', 'ከስልጠና በኋላ ግብረመልስ መሰብሰቢያ።', 'Leenjii booda yaada walitti qabuuf.'),
    submitLabel: emptyLocalized('Send Feedback', 'ግብረመልስ ላክ', 'Yaada Ergi'),
    doneMessage: emptyLocalized('Thank you for helping improve accessibility.', 'ተደራሽነትን ለማሻሻል ስለረዱን እናመሰግናለን።', 'Dhaqqabummaa fooyyessuuf waan gargaartaniif galatoomaa.'),
    branding: { ...organization.branding },
    sections: [
      {
        id: sec1Id,
        sortOrder: 0,
        title: emptyLocalized('Session Rating', 'የክፍለ-ጊዜ ደረጃ', 'Sadarkaa Leenjii'),
        description: emptyLocalized('Quick 2-question check.', 'ፈጣን ግምገማ።', 'Sakattaʼiinsa ariifataa.'),
      },
    ],
    questions: [
      {
        id: `q-${Date.now()}-1`,
        sectionId: sec1Id,
        fieldKey: 'rating',
        sortOrder: 0,
        questionType: 'radio',
        label: emptyLocalized('How accessible was this session?', 'ይህ ክፍለ-ጊዜ ምን ያህል ተደራሽ ነበር?', 'Sagantaan kun hangam dhaqqabamaa ture?'),
        helpText: emptyLocalized('Choose one option.', 'አንድ አማራጭ ይምረጡ።', 'Filannoo tokko filadhaa.'),
        whyWeAsk: emptyLocalized('Guides accessibility improvements.', 'የተደራሽነት መሻሻሎችን ይመራል።', 'Fooyyaʼiinsa dhaqqabummaa qajeelcha.'),
        placeholder: emptyLocalized(),
        required: true,
        sensitive: false,
        options: [
          { value: 'excellent', label: emptyLocalized('Fully accessible', 'ሙሉ በሙሉ ተደራሽ', 'Guutumaan guutuutti dhaqqabamaa') },
          { value: 'needs_work', label: emptyLocalized('Needs improvement', 'መሻሻል ያስፈልገዋል', 'Fooyyaʼiinsa barbaada') },
        ],
        validation: {},
        conditionalLogic: null,
      },
      {
        id: `q-${Date.now()}-2`,
        sectionId: sec1Id,
        fieldKey: 'attend_date',
        sortOrder: 1,
        questionType: 'date',
        label: emptyLocalized('Session date', 'የክፍለ-ጊዜ ቀን', 'Guyyaa sagantaa'),
        helpText: emptyLocalized('Date attended.', 'የተሳተፉበት ቀን።', 'Guyyaa hirmaannaa.'),
        whyWeAsk: emptyLocalized('Links feedback to the right cohort.', 'ግብረመልሱን ከትክክለኛው ቡድን ጋር ያገናኛል።', 'Yaada garee sirrii waliin wal qabsiisa.'),
        placeholder: emptyLocalized(),
        required: false,
        sensitive: false,
        options: [],
        validation: {},
        conditionalLogic: null,
      },
    ],
  };
}

export const FormBuilderWorkspace: React.FC<FormBuilderWorkspaceProps> = ({
  admin,
  initialNotice,
  onAdminUpdated,
  onSessionExpired,
  onLogout,
  onOpenPublicForm,
}) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('forms');
  const [editLang, setEditLang] = useState<SupportedLanguage>('en');
  const [organizations, setOrganizations] = useState<OrganizationRecord[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>(admin.organizationId || '');
  const [forms, setForms] = useState<FormBuilderForm[]>([]);
  const [activeForm, setActiveForm] = useState<FormBuilderForm | null>(null);
  const [versions, setVersions] = useState<FormVersionRecord[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [submissions, setSubmissions] = useState<FormSubmissionRecord[]>([]);
  const [privateSupport, setPrivateSupport] = useState<PrivateSupportRecord[]>([]);
  const [analytics, setAnalytics] = useState<DashboardAnalyticsSummary | null>(null);
  const [orgAdmins, setOrgAdmins] = useState<AdminAccountSummary[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(initialNotice || null);

  // Create Org modal/inline state
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSlug, setNewOrgSlug] = useState('');
  const [newOrgType, setNewOrgType] = useState<OrganizationType>('university');

  // Create Org Admin state
  const [newOrgAdminUser, setNewOrgAdminUser] = useState('');
  const [newOrgAdminPass, setNewOrgAdminPass] = useState('');
  const [newOrgAdminOrgId, setNewOrgAdminOrgId] = useState('');

  const handleApiError = useCallback(
    (err: unknown) => {
      if (err instanceof AdminApiError) {
        if (err.status === 401) {
          onSessionExpired(err.message || t.formBuilder.sessionExpired);
          return;
        }
        setErrorMsg(err.message);
        return;
      }
      setErrorMsg(err instanceof Error ? err.message : 'Unexpected administration error.');
    },
    [onSessionExpired, t.formBuilder.sessionExpired]
  );

  const loadWorkspaceData = useCallback(
    async (targetOrgId?: string) => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const orgList = await adminApi.listOrganizations();
        setOrganizations(orgList);
        const effectiveOrgId =
          admin.role === 'org_admin'
            ? admin.organizationId || orgList[0]?.id || ''
            : targetOrgId && orgList.some((o) => o.id === targetOrgId)
            ? targetOrgId
            : selectedOrgId && orgList.some((o) => o.id === selectedOrgId)
            ? selectedOrgId
            : orgList[0]?.id || '';

        if (effectiveOrgId !== selectedOrgId) {
          setSelectedOrgId(effectiveOrgId);
        }
        if (!newOrgAdminOrgId && orgList[0]?.id) {
          setNewOrgAdminOrgId(orgList[0].id);
        }

        const [formList, subList, stats, supportList] = await Promise.all([
          adminApi.listForms(effectiveOrgId || undefined),
          adminApi.listSubmissions({ organizationId: effectiveOrgId || undefined }),
          adminApi.getAnalytics(effectiveOrgId || undefined),
          adminApi.listPrivateSupportRequests(effectiveOrgId || undefined),
        ]);

        setForms(formList);
        setSubmissions(subList);
        setAnalytics(stats);
        setPrivateSupport(supportList);

        setActiveForm((prev) => {
          if (prev) {
            const refreshed = formList.find((f) => f.id === prev.id);
            if (refreshed) return refreshed;
          }
          return formList[0] || null;
        });

        if (admin.role === 'platform_admin') {
          const admins = await adminApi.listOrgAdmins();
          setOrgAdmins(admins);
        }
      } catch (err) {
        handleApiError(err);
      } finally {
        setLoading(false);
      }
    },
    [admin.organizationId, admin.role, handleApiError, newOrgAdminOrgId, selectedOrgId]
  );

  useEffect(() => {
    void loadWorkspaceData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin.id, admin.mustChangeCredentials]);

  const activeOrg = useMemo(
    () => organizations.find((o) => o.id === selectedOrgId) || organizations[0] || null,
    [organizations, selectedOrgId]
  );

  const handleSelectOrg = (nextOrgId: string) => {
    setSelectedOrgId(nextOrgId);
    setActiveForm(null);
    setShowVersions(false);
    void loadWorkspaceData(nextOrgId);
  };

  const handleCreateBlankForm = async () => {
    if (!activeOrg) return;
    setSaving(true);
    setErrorMsg(null);
    const secId = `sec-${Date.now()}`;
    try {
      const created = await adminApi.createForm({
        organizationId: activeOrg.id,
        slug: `form-${Date.now().toString().slice(-5)}`,
        type: 'custom',
        title: emptyLocalized(`${activeOrg.name} Custom Form`, `${activeOrg.name} ብጁ ቅጽ`, `Unka ${activeOrg.name}`),
        description: emptyLocalized('Accessible organization form.', 'ተደራሽ የድርጅት ቅጽ።', 'Unka dhaabbataa dhaqqabamaa.'),
        submitLabel: emptyLocalized('Submit Form', 'ቅጹን አስገባ', 'Unka Ergi'),
        doneMessage: emptyLocalized('Form submitted successfully.', 'ቅጹ በተሳካ ሁኔታ ገብቷል።', 'Unki milkaaʼinaan ergameera.'),
        branding: { ...activeOrg.branding },
        sections: [
          {
            id: secId,
            sortOrder: 0,
            title: emptyLocalized('Section 1', 'ክፍል 1', 'Kutaa 1'),
            description: emptyLocalized(),
          },
        ],
        questions: [
          {
            id: `q-${Date.now()}`,
            sectionId: secId,
            fieldKey: 'full_name',
            sortOrder: 0,
            questionType: 'text',
            label: emptyLocalized('Full name', 'ሙሉ ስም', 'Maqaa guutuu'),
            helpText: emptyLocalized('Please enter your name.', 'እባክዎ ስምዎን ያስገቡ።', 'Maaloo maqaa keessan galchaa.'),
            whyWeAsk: emptyLocalized('To identify your submission.', 'ማመልከቻዎን ለመለየት።', 'Galmee keessan addaan baasuuf.'),
            placeholder: emptyLocalized('Full name'),
            required: true,
            sensitive: false,
            options: [],
            validation: { minLength: 2, maxLength: 120 },
            conditionalLogic: null,
          },
        ],
      });
      setForms((prev) => [created, ...prev]);
      setActiveForm(created);
      setNoticeMsg('Created new draft form.');
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTemplateForm = async (
    key: 'learner_intake' | 'employer_survey' | 'workshop_feedback'
  ) => {
    if (!activeOrg) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const payload = makeTemplateForm(key, activeOrg);
      const created = await adminApi.createForm(payload);
      setForms((prev) => [created, ...prev]);
      setActiveForm(created);
      setNoticeMsg('Created form from template.');
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveActiveForm = async () => {
    if (!activeForm) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const saved = await adminApi.saveForm(activeForm.id, activeForm);
      setForms((prev) => prev.map((f) => (f.id === saved.id ? saved : f)));
      setActiveForm(saved);
      setNoticeMsg('Form draft saved to database.');
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const handlePublishActiveForm = async () => {
    if (!activeForm) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const savedFirst = await adminApi.saveForm(activeForm.id, activeForm);
      const { form, version } = await adminApi.publishForm(savedFirst.id);
      setForms((prev) => prev.map((f) => (f.id === form.id ? form : f)));
      setActiveForm(form);
      setVersions((prev) => [version, ...prev]);
      setNoticeMsg(`Published version v${version.versionNumber}. Public form runner updated.`);
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveActiveForm = async () => {
    if (!activeForm) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const archived = await adminApi.archiveForm(activeForm.id);
      setForms((prev) => prev.map((f) => (f.id === archived.id ? archived : f)));
      setActiveForm(archived);
      setNoticeMsg('Form archived.');
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteActiveForm = async () => {
    if (!activeForm) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await adminApi.deleteForm(activeForm.id);
      const next = forms.filter((f) => f.id !== activeForm.id);
      setForms(next);
      setActiveForm(next[0] || null);
      setNoticeMsg('Form deleted.');
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleVersions = async () => {
    if (!activeForm) return;
    if (!showVersions) {
      try {
        const list = await adminApi.listFormVersions(activeForm.id);
        setVersions(list);
      } catch (err) {
        handleApiError(err);
      }
    }
    setShowVersions((prev) => !prev);
  };

  // Section & question mutators
  const addSection = () => {
    if (!activeForm) return;
    const nextSection: FormBuilderSection = {
      id: `sec-${Date.now()}`,
      sortOrder: activeForm.sections.length,
      title: emptyLocalized(`Section ${activeForm.sections.length + 1}`, `ክፍል ${activeForm.sections.length + 1}`, `Kutaa ${activeForm.sections.length + 1}`),
      description: emptyLocalized(),
    };
    setActiveForm({ ...activeForm, sections: [...activeForm.sections, nextSection] });
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    if (!activeForm) return;
    const target = idx + dir;
    if (target < 0 || target >= activeForm.sections.length) return;
    const copy = [...activeForm.sections];
    const [item] = copy.splice(idx, 1);
    copy.splice(target, 0, item);
    setActiveForm({
      ...activeForm,
      sections: copy.map((s, i) => ({ ...s, sortOrder: i })),
    });
  };

  const deleteSection = (sectionId: string) => {
    if (!activeForm || activeForm.sections.length <= 1) return;
    const remaining = activeForm.sections.filter((s) => s.id !== sectionId);
    const fallbackId = remaining[0].id;
    setActiveForm({
      ...activeForm,
      sections: remaining.map((s, i) => ({ ...s, sortOrder: i })),
      questions: activeForm.questions.map((q) =>
        q.sectionId === sectionId ? { ...q, sectionId: fallbackId } : q
      ),
    });
  };

  const addQuestion = (questionType: FormQuestionType = 'text') => {
    if (!activeForm) return;
    const sectionId = activeForm.sections[0]?.id || `sec-${Date.now()}`;
    const hasOptions = questionType === 'dropdown' || questionType === 'radio' || questionType === 'checkbox';
    const nextQ: FormBuilderQuestion = {
      id: `q-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      sectionId,
      fieldKey: `field_${activeForm.questions.length + 1}`,
      sortOrder: activeForm.questions.length,
      questionType,
      label: emptyLocalized(`Question ${activeForm.questions.length + 1}`, `ጥያቄ ${activeForm.questions.length + 1}`, `Gaaffii ${activeForm.questions.length + 1}`),
      helpText: emptyLocalized(),
      whyWeAsk: emptyLocalized('Helps tailor accessible support.', 'ተደራሽ ድጋፍን ለማዘጋጀት።', 'Deeggarsa dhaqqabamaa qopheessuuf.'),
      placeholder: emptyLocalized(),
      required: false,
      sensitive: false,
      options: hasOptions
        ? [
            { value: 'option_1', label: emptyLocalized('Option 1', 'አማራጭ 1', 'Filannoo 1') },
            { value: 'option_2', label: emptyLocalized('Option 2', 'አማራጭ 2', 'Filannoo 2') },
          ]
        : [],
      validation: {},
      conditionalLogic: null,
    };
    setActiveForm({
      ...activeForm,
      questions: [...activeForm.questions, nextQ],
    });
  };

  const updateQuestion = (qId: string, patch: Partial<FormBuilderQuestion>) => {
    if (!activeForm) return;
    setActiveForm({
      ...activeForm,
      questions: activeForm.questions.map((q) => (q.id === qId ? { ...q, ...patch } : q)),
    });
  };

  const moveQuestion = (idx: number, dir: -1 | 1) => {
    if (!activeForm) return;
    const target = idx + dir;
    if (target < 0 || target >= activeForm.questions.length) return;
    const copy = [...activeForm.questions];
    const [item] = copy.splice(idx, 1);
    copy.splice(target, 0, item);
    setActiveForm({
      ...activeForm,
      questions: copy.map((q, i) => ({ ...q, sortOrder: i })),
    });
  };

  const deleteQuestion = (qId: string) => {
    if (!activeForm) return;
    setActiveForm({
      ...activeForm,
      questions: activeForm.questions
        .filter((q) => q.id !== qId)
        .map((q, i) => ({ ...q, sortOrder: i })),
    });
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim() || !newOrgSlug.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const created = await adminApi.createOrganization({
        name: newOrgName.trim(),
        slug: newOrgSlug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
        type: newOrgType,
      });
      setOrganizations((prev) => [...prev, created]);
      setNewOrgName('');
      setNewOrgSlug('');
      setNoticeMsg(`Organization "${created.name}" created.`);
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateOrgAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!isStrongAdminPassword(newOrgAdminPass)) {
      setErrorMsg(t.formBuilder.passwordWeakError);
      return;
    }
    setSaving(true);
    try {
      const created = await adminApi.createOrgAdmin({
        username: newOrgAdminUser.trim(),
        password: newOrgAdminPass,
        organizationId: newOrgAdminOrgId,
      });
      setOrgAdmins((prev) => [...prev, created]);
      setNewOrgAdminUser('');
      setNewOrgAdminPass('');
      setNoticeMsg(`Organization administrator "${created.username}" created.`);
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const publicShareUrl =
    activeForm && typeof window !== 'undefined'
      ? `${window.location.origin}/?form=${encodeURIComponent(activeForm.id)}`
      : '';

  return (
    <div className="space-y-6">
      {/* Workspace Header */}
      <header
        className="rounded-2xl bg-[#0F1E36] text-white p-6 shadow-md border border-white/10"
        style={{ backgroundColor: 'var(--gw-primary)', color: 'var(--gw-primary-text)' }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400">
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.formBuilder.workspaceBadge}</span>
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              {t.formBuilder.workspaceTitle}
            </h1>
            <p className="text-xs sm:text-sm text-slate-200">
              Signed in as <strong className="text-white">{admin.username}</strong> ({admin.role})
              {activeOrg ? ` · Organization: ${activeOrg.name}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {admin.role === 'platform_admin' && organizations.length > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="fb-org-selector" className="text-xs font-semibold text-slate-200">
                  Tenant:
                </label>
                <select
                  id="fb-org-selector"
                  value={selectedOrgId}
                  onChange={(e) => handleSelectOrg(e.target.value)}
                  className="min-h-[42px] rounded-lg border border-white/25 bg-[#162947] px-3 py-1.5 text-sm font-semibold text-white"
                >
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({org.type})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={() => void onLogout()}
              className="inline-flex items-center gap-1.5 min-h-[42px] px-4 py-2 rounded-lg border border-white/25 bg-[#162947] hover:bg-white/15 text-sm font-semibold text-white cursor-pointer"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span>{t.formBuilder.logoutButton}</span>
            </button>
          </div>
        </div>

        {/* Workspace Navigation Tabs */}
        <nav aria-label="Form Builder workspace tabs" className="mt-5 pt-4 border-t border-white/15 flex flex-wrap gap-2">
          {(
            [
              { id: 'forms', label: t.formBuilder.tabs.forms, icon: FileText },
              { id: 'organizations', label: t.formBuilder.tabs.organizations, icon: Building2 },
              { id: 'submissions', label: t.formBuilder.tabs.submissions, icon: CheckCircle2 },
              { id: 'analytics', label: t.formBuilder.tabs.analytics, icon: BarChart3 },
              { id: 'settings', label: t.formBuilder.tabs.settings, icon: Settings },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-amber-500 text-[#0F1E36] font-bold'
                    : 'bg-white/10 text-slate-100 hover:bg-white/20'
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* Alerts / Notices */}
      {noticeMsg && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 px-4 py-3 text-sm font-medium text-emerald-950 dark:text-emerald-100"
        >
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            <span>{noticeMsg}</span>
          </span>
          <button
            type="button"
            onClick={() => setNoticeMsg(null)}
            className="text-xs font-bold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/60 px-4 py-3 text-sm font-medium text-red-950 dark:text-red-100"
        >
          <span className="inline-flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-700 dark:text-red-400" aria-hidden="true" />
            <span>{errorMsg}</span>
          </span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-xs font-bold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading && (
        <div role="status" className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-sm font-medium">
          {t.common.loadingStatus}
        </div>
      )}

      {/* TAB 1: FORMS BUILDER */}
      {!loading && activeTab === 'forms' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left column: Forms list + Templates */}
          <aside className="xl:col-span-4 space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold text-[#0F1E36] dark:text-white">
                  Organization Forms
                </h2>
                <button
                  type="button"
                  disabled={saving || !activeOrg}
                  onClick={() => void handleCreateBlankForm()}
                  className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg bg-[#0F1E36] hover:bg-[#1E3A5F] dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-[#0F1E36] text-xs font-bold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t.formBuilder.createFormButton}</span>
                </button>
              </div>

              <div className="space-y-2">
                {forms.length === 0 ? (
                  <p className="text-sm text-slate-600 dark:text-slate-400 py-3">
                    No forms for this organization yet. Create a blank form or start from a template below.
                  </p>
                ) : (
                  forms.map((form) => {
                    const selected = activeForm?.id === form.id;
                    return (
                      <button
                        key={form.id}
                        type="button"
                        onClick={() => {
                          setActiveForm(form);
                          setShowVersions(false);
                        }}
                        className={`w-full text-start p-3.5 rounded-xl border transition-colors cursor-pointer space-y-1 ${
                          selected
                            ? 'border-[#0F1E36] dark:border-amber-400 bg-[#0F1E36]/[0.05] dark:bg-amber-500/10'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-sm text-[#0F1E36] dark:text-white truncate">
                            {form.title.en || form.slug}
                          </span>
                          <span className="font-mono text-[11px] uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
                            {form.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                          /{form.slug} · {form.questions.length} fields
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[#0F1E36] dark:text-white">
                <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <span>Accessible Templates</span>
              </div>
              <div className="space-y-2">
                {(
                  [
                    { key: 'learner_intake', label: 'Learner Accessible Intake (EN/AM/OM + Conditional)' },
                    { key: 'employer_survey', label: 'Employer Workplace Readiness' },
                    { key: 'workshop_feedback', label: 'Session Accessibility Feedback' },
                  ] as const
                ).map((tpl) => (
                  <button
                    key={tpl.key}
                    type="button"
                    disabled={saving || !activeOrg}
                    onClick={() => void handleCreateTemplateForm(tpl.key)}
                    className="w-full text-start min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#0F1E36] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    + {tpl.label}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* Right column: Selected Form Editor */}
          <section className="xl:col-span-8 space-y-6">
            {!activeForm ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-600 dark:text-slate-400">
                Select or create a form to configure fields, multilingual translations, conditional logic, and publishing.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6">
                {/* Editor Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Edit language:
                    </span>
                    {(['en', 'am', 'om'] as const).map((lng) => (
                      <button
                        key={lng}
                        type="button"
                        aria-pressed={editLang === lng}
                        onClick={() => setEditLang(lng)}
                        className={`min-h-[36px] px-3 py-1 rounded-lg border text-xs font-bold cursor-pointer ${
                          editLang === lng
                            ? 'border-[#0F1E36] dark:border-amber-400 bg-[#0F1E36] dark:bg-amber-500 text-white dark:text-[#0F1E36]'
                            : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {lng === 'en' ? 'English' : lng === 'am' ? 'አማርኛ' : 'Afaan Oromoo'}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleSaveActiveForm()}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-[#0F1E36] dark:text-white hover:bg-slate-50 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t.formBuilder.saveDraftButton}</span>
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handlePublishActiveForm()}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0F1E36] text-xs font-bold cursor-pointer"
                    >
                      <Rocket className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t.formBuilder.publishButton}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleToggleVersions()}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t.formBuilder.versionHistoryTitle}</span>
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleArchiveActiveForm()}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t.formBuilder.archiveButton}</span>
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleDeleteActiveForm()}
                      aria-label="Delete form"
                      className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Published Link */}
                {activeForm.status === 'published' && (
                  <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 p-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs space-y-0.5 min-w-0">
                      <p className="font-bold text-emerald-900 dark:text-emerald-200">
                        {t.formBuilder.previewPublicLinkLabel}
                      </p>
                      <p className="font-mono text-emerald-800 dark:text-emerald-300 truncate">
                        {publicShareUrl}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (navigator.clipboard && publicShareUrl) {
                            void navigator.clipboard.writeText(publicShareUrl);
                            setNoticeMsg('Public form URL copied to clipboard.');
                          }
                        }}
                        className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg border border-emerald-400 bg-white dark:bg-slate-900 text-xs font-bold text-emerald-900 dark:text-emerald-200 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Copy URL</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenPublicForm(activeForm.id)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                      >
                        Open Public Runner
                      </button>
                    </div>
                  </div>
                )}

                {/* Version History Drawer */}
                {showVersions && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4 space-y-2">
                    <h3 className="text-sm font-bold text-[#0F1E36] dark:text-white">
                      {t.formBuilder.versionHistoryTitle}
                    </h3>
                    {versions.length === 0 ? (
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        No published snapshots yet. Click Publish Version to create v1.
                      </p>
                    ) : (
                      <ul className="space-y-1.5 text-xs tabular-nums">
                        {versions.map((ver) => (
                          <li
                            key={ver.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
                          >
                            <span className="font-mono font-bold">
                              v{ver.versionNumber} ({ver.status})
                            </span>
                            <span className="text-slate-600 dark:text-slate-400">
                              {new Date(ver.publishedAt).toLocaleString()} ·{' '}
                              {ver.schemaSnapshot.questions.length} questions
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Form Metadata & Branding */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Form Title ({editLang.toUpperCase()})
                    </label>
                    <input
                      type="text"
                      value={activeForm.title[editLang]}
                      onChange={(e) =>
                        setActiveForm({
                          ...activeForm,
                          title: { ...activeForm.title, [editLang]: e.target.value },
                        })
                      }
                      className="w-full min-h-[42px] rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3 py-2 text-sm text-[#0F1E36] dark:text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Slug
                      </label>
                      <input
                        type="text"
                        value={activeForm.slug}
                        onChange={(e) => setActiveForm({ ...activeForm, slug: e.target.value })}
                        className="w-full min-h-[42px] rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3 py-2 text-sm font-mono text-[#0F1E36] dark:text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Form Category
                      </label>
                      <select
                        value={activeForm.type}
                        onChange={(e) =>
                          setActiveForm({ ...activeForm, type: e.target.value as FormCategory })
                        }
                        className="w-full min-h-[42px] rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3 py-2 text-sm text-[#0F1E36] dark:text-white"
                      >
                        <option value="onboarding">Onboarding</option>
                        <option value="career">Career</option>
                        <option value="feedback">Feedback</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Description ({editLang.toUpperCase()})
                    </label>
                    <input
                      type="text"
                      value={activeForm.description[editLang]}
                      onChange={(e) =>
                        setActiveForm({
                          ...activeForm,
                          description: { ...activeForm.description, [editLang]: e.target.value },
                        })
                      }
                      className="w-full min-h-[42px] rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3 py-2 text-sm text-[#0F1E36] dark:text-white"
                    />
                  </div>
                </div>

                {/* Sections */}
                <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-[#0F1E36] dark:text-white">
                      Sections ({activeForm.sections.length})
                    </h3>
                    <button
                      type="button"
                      onClick={addSection}
                      className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold text-[#0F1E36] dark:text-white cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t.formBuilder.addSectionButton}</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {activeForm.sections.map((sec, idx) => (
                      <div
                        key={sec.id}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3"
                      >
                        <input
                          type="text"
                          aria-label={`Section ${idx + 1} title (${editLang})`}
                          value={sec.title[editLang]}
                          onChange={(e) =>
                            setActiveForm({
                              ...activeForm,
                              sections: activeForm.sections.map((s) =>
                                s.id === sec.id
                                  ? { ...s, title: { ...s.title, [editLang]: e.target.value } }
                                  : s
                              ),
                            })
                          }
                          className="flex-1 min-w-[200px] min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => moveSection(idx, -1)}
                          aria-label="Move section up"
                          className="p-2 rounded border border-slate-300 dark:border-slate-700 cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSection(idx, 1)}
                          aria-label="Move section down"
                          className="p-2 rounded border border-slate-300 dark:border-slate-700 cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        {activeForm.sections.length > 1 && (
                          <button
                            type="button"
                            onClick={() => deleteSection(sec.id)}
                            aria-label="Delete section"
                            className="p-2 rounded border border-red-300 text-red-700 dark:text-red-300 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Questions (All 12 Question Types + Conditional Logic + Options + Validation) */}
                <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-[#0F1E36] dark:text-white">
                      Questions ({activeForm.questions.length})
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label="Question type to add"
                        defaultValue="text"
                        id="fb-add-question-type"
                        className="min-h-[36px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs font-semibold"
                      >
                        {QUESTION_TYPES.map((qt) => (
                          <option key={qt} value={qt}>
                            {t.formBuilder.questionTypes[qt]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          const el = document.getElementById('fb-add-question-type') as HTMLSelectElement | null;
                          addQuestion((el?.value as FormQuestionType) || 'text');
                        }}
                        className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 rounded-lg bg-[#0F1E36] dark:bg-amber-500 text-white dark:text-[#0F1E36] text-xs font-bold cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{t.formBuilder.addQuestionButton}</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {activeForm.questions.map((q, idx) => {
                      const hasOptions =
                        q.questionType === 'dropdown' ||
                        q.questionType === 'radio' ||
                        q.questionType === 'checkbox';
                      const otherFieldKeys = activeForm.questions
                        .filter((other) => other.id !== q.id)
                        .map((other) => other.fieldKey);

                      return (
                        <article
                          key={q.id}
                          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-4 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-xs font-bold text-[#1E3A5F] dark:text-amber-400">
                              Q{idx + 1} · {q.fieldKey} ({t.formBuilder.questionTypes[q.questionType]})
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => moveQuestion(idx, -1)}
                                aria-label="Move question up"
                                className="p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer"
                              >
                                <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveQuestion(idx, 1)}
                                aria-label="Move question down"
                                className="p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer"
                              >
                                <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteQuestion(q.id)}
                                aria-label="Delete question"
                                className="p-1.5 rounded border border-red-300 text-red-700 dark:text-red-300 bg-white dark:bg-slate-900 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <label className="block text-xs font-semibold">
                                Label ({editLang.toUpperCase()})
                              </label>
                              <input
                                type="text"
                                value={q.label[editLang]}
                                onChange={(e) =>
                                  updateQuestion(q.id, {
                                    label: { ...q.label, [editLang]: e.target.value },
                                  })
                                }
                                className="w-full min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="block text-xs font-semibold">Question Type</label>
                              <select
                                value={q.questionType}
                                onChange={(e) => {
                                  const nextType = e.target.value as FormQuestionType;
                                  const needsOpts =
                                    nextType === 'dropdown' || nextType === 'radio' || nextType === 'checkbox';
                                  updateQuestion(q.id, {
                                    questionType: nextType,
                                    options:
                                      needsOpts && q.options.length === 0
                                        ? [{ value: 'option_1', label: emptyLocalized('Option 1') }]
                                        : q.options,
                                  });
                                }}
                                className="w-full min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-sm"
                              >
                                {QUESTION_TYPES.map((qt) => (
                                  <option key={qt} value={qt}>
                                    {t.formBuilder.questionTypes[qt]}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="block text-xs font-semibold">Section</label>
                              <select
                                value={q.sectionId}
                                onChange={(e) => updateQuestion(q.id, { sectionId: e.target.value })}
                                className="w-full min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-sm"
                              >
                                {activeForm.sections.map((sec) => (
                                  <option key={sec.id} value={sec.id}>
                                    {sec.title.en || sec.id}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <label className="block text-xs font-semibold">Field Key</label>
                              <input
                                type="text"
                                value={q.fieldKey}
                                onChange={(e) =>
                                  updateQuestion(q.id, {
                                    fieldKey: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_'),
                                  })
                                }
                                className="w-full min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="block text-xs font-semibold">
                                Help Text ({editLang.toUpperCase()})
                              </label>
                              <input
                                type="text"
                                value={q.helpText[editLang]}
                                onChange={(e) =>
                                  updateQuestion(q.id, {
                                    helpText: { ...q.helpText, [editLang]: e.target.value },
                                  })
                                }
                                className="w-full min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm"
                              />
                            </div>

                            <div className="flex items-end gap-4 pb-1">
                              <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={q.required}
                                  onChange={(e) => updateQuestion(q.id, { required: e.target.checked })}
                                  className="h-4 w-4 accent-[#0F1E36]"
                                />
                                <span>Required</span>
                              </label>
                              <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={q.sensitive}
                                  onChange={(e) => updateQuestion(q.id, { sensitive: e.target.checked })}
                                  className="h-4 w-4 accent-[#0F1E36]"
                                />
                                <span>Sensitive / Private</span>
                              </label>
                            </div>
                          </div>

                          {/* Options Editor */}
                          {hasOptions && (
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold">Options ({editLang.toUpperCase()})</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateQuestion(q.id, {
                                      options: [
                                        ...q.options,
                                        {
                                          value: `opt_${q.options.length + 1}`,
                                          label: emptyLocalized(`Option ${q.options.length + 1}`),
                                        },
                                      ],
                                    })
                                  }
                                  className="text-xs font-bold text-[#1E3A5F] dark:text-amber-400 hover:underline cursor-pointer"
                                >
                                  + Add option
                                </button>
                              </div>
                              {q.options.map((opt, optIdx) => (
                                <div key={`${opt.value}-${optIdx}`} className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    placeholder="Value"
                                    value={opt.value}
                                    onChange={(e) => {
                                      const nextOpts = q.options.map((o, i) =>
                                        i === optIdx ? { ...o, value: e.target.value } : o
                                      );
                                      updateQuestion(q.id, { options: nextOpts });
                                    }}
                                    className="w-28 min-h-[34px] rounded border border-slate-300 dark:border-slate-700 px-2 text-xs font-mono bg-slate-50 dark:bg-slate-800"
                                  />
                                  <input
                                    type="text"
                                    placeholder={`Label (${editLang})`}
                                    value={opt.label[editLang]}
                                    onChange={(e) => {
                                      const nextOpts = q.options.map((o, i) =>
                                        i === optIdx
                                          ? { ...o, label: { ...o.label, [editLang]: e.target.value } }
                                          : o
                                      );
                                      updateQuestion(q.id, { options: nextOpts });
                                    }}
                                    className="flex-1 min-h-[34px] rounded border border-slate-300 dark:border-slate-700 px-2.5 text-xs bg-white dark:bg-slate-900"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateQuestion(q.id, {
                                        options: q.options.filter((_, i) => i !== optIdx),
                                      })
                                    }
                                    className="text-xs text-red-700 dark:text-red-300 px-2 py-1 cursor-pointer"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Conditional Visibility Logic */}
                          {otherFieldKeys.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
                              <span className="font-semibold text-slate-600 dark:text-slate-300">
                                Show only when:
                              </span>
                              <select
                                value={q.conditionalLogic?.dependsOnKey || ''}
                                onChange={(e) => {
                                  const key = e.target.value;
                                  if (!key) {
                                    updateQuestion(q.id, { conditionalLogic: null });
                                  } else {
                                    updateQuestion(q.id, {
                                      conditionalLogic: {
                                        dependsOnKey: key,
                                        operator: q.conditionalLogic?.operator || 'equals',
                                        value: q.conditionalLogic?.value || 'yes',
                                      },
                                    });
                                  }
                                }}
                                className="min-h-[34px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2"
                              >
                                <option value="">Always visible</option>
                                {otherFieldKeys.map((fk) => (
                                  <option key={fk} value={fk}>
                                    {fk}
                                  </option>
                                ))}
                              </select>
                              {q.conditionalLogic && (
                                <>
                                  <select
                                    value={q.conditionalLogic.operator}
                                    onChange={(e) =>
                                      updateQuestion(q.id, {
                                        conditionalLogic: {
                                          ...q.conditionalLogic!,
                                          operator: e.target.value as 'equals' | 'not_equals' | 'contains' | 'is_truthy',
                                        },
                                      })
                                    }
                                    className="min-h-[34px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2"
                                  >
                                    <option value="equals">equals</option>
                                    <option value="not_equals">not equals</option>
                                    <option value="contains">contains</option>
                                    <option value="is_truthy">is answered / true</option>
                                  </select>
                                  {q.conditionalLogic.operator !== 'is_truthy' && (
                                    <input
                                      type="text"
                                      placeholder="expected value"
                                      value={q.conditionalLogic.value || ''}
                                      onChange={(e) =>
                                        updateQuestion(q.id, {
                                          conditionalLogic: {
                                            ...q.conditionalLogic!,
                                            value: e.target.value,
                                          },
                                        })
                                      }
                                      className="min-h-[34px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5"
                                    />
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: ORGANIZATIONS & ORG ADMINS */}
      {!loading && activeTab === 'organizations' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {organizations.map((org) => (
              <article
                key={org.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-[#0F1E36] dark:text-white">{org.name}</h3>
                    <p className="text-xs font-mono text-slate-600 dark:text-slate-400">
                      slug: {org.slug} · type: {org.type}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectOrg(org.id)}
                    className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Manage Forms
                  </button>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-slate-700 dark:text-slate-300">
                  <span>Primary: {org.branding.primaryColor}</span>
                  <span>Default Lang: {org.branding.defaultLanguage.toUpperCase()}</span>
                  <span>
                    Anonymous onboarding: {org.onboardingConfig.allowAnonymousOnboarding ? 'Allowed' : 'Restricted'}
                  </span>
                </div>
              </article>
            ))}
          </div>

          {admin.role === 'platform_admin' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <form
                onSubmit={handleCreateOrg}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
              >
                <h2 className="text-lg font-bold text-[#0F1E36] dark:text-white">
                  {t.formBuilder.createOrgTitle}
                </h2>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold">Organization Name</label>
                  <input
                    type="text"
                    required
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    placeholder="Addis Inclusive University"
                    className="w-full min-h-[42px] rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold">Slug</label>
                    <input
                      type="text"
                      required
                      value={newOrgSlug}
                      onChange={(e) => setNewOrgSlug(e.target.value)}
                      placeholder="addis-university"
                      className="w-full min-h-[42px] rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3 text-sm font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold">Type</label>
                    <select
                      value={newOrgType}
                      onChange={(e) => setNewOrgType(e.target.value as OrganizationType)}
                      className="w-full min-h-[42px] rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3 text-sm"
                    >
                      {ORG_TYPES.map((ot) => (
                        <option key={ot} value={ot}>
                          {ot}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-5 py-2 rounded-lg bg-[#0F1E36] dark:bg-amber-500 text-white dark:text-[#0F1E36] text-sm font-bold cursor-pointer"
                >
                  Create Organization
                </button>
              </form>

              <form
                onSubmit={handleCreateOrgAdmin}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
              >
                <h2 className="text-lg font-bold text-[#0F1E36] dark:text-white">
                  Provision Organization Admin
                </h2>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold">Organization</label>
                  <select
                    value={newOrgAdminOrgId}
                    onChange={(e) => setNewOrgAdminOrgId(e.target.value)}
                    className="w-full min-h-[42px] rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3 text-sm"
                  >
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold">Admin Username</label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      value={newOrgAdminUser}
                      onChange={(e) => setNewOrgAdminUser(e.target.value)}
                      className="w-full min-h-[42px] rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold">Initial Password</label>
                    <input
                      type="password"
                      data-ai-masked="true"
                      required
                      value={newOrgAdminPass}
                      onChange={(e) => setNewOrgAdminPass(e.target.value)}
                      className="w-full min-h-[42px] rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3 text-sm"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0F1E36] text-sm font-bold cursor-pointer"
                >
                  Create Organization Admin
                </button>

                {orgAdmins.length > 0 && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Existing Organization Admins ({orgAdmins.length})
                    </p>
                    {orgAdmins.map((oa) => (
                      <div key={oa.id} className="text-xs font-mono text-slate-700 dark:text-slate-300">
                        {oa.username} → {organizations.find((o) => o.id === oa.organizationId)?.name || oa.organizationId}
                      </div>
                    ))}
                  </div>
                )}
              </form>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SUBMISSIONS & CONFIDENTIAL PRIVATE SUPPORT */}
      {!loading && activeTab === 'submissions' && (
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <h2 className="text-lg font-bold text-[#0F1E36] dark:text-white">
              Dynamic Form Submissions ({submissions.length})
            </h2>
            {submissions.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                No submissions recorded for this organization yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                      <th className="py-2.5 pe-4 text-start">Submission ID</th>
                      <th className="py-2.5 pe-4 text-start">Form</th>
                      <th className="py-2.5 pe-4 text-start">Submitted</th>
                      <th className="py-2.5 text-start">Answers Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {submissions.map((sub) => (
                      <tr key={sub.id}>
                        <td className="py-3 pe-4 font-mono text-xs tabular-nums">{sub.id}</td>
                        <td className="py-3 pe-4 text-xs font-semibold">
                          {forms.find((f) => f.id === sub.formId)?.title.en || sub.formId}
                        </td>
                        <td className="py-3 pe-4 font-mono text-xs tabular-nums">
                          {new Date(sub.submittedAt).toLocaleString()}
                        </td>
                        <td className="py-3 font-mono text-xs text-slate-700 dark:text-slate-300 max-w-md truncate">
                          {JSON.stringify(sub.answers)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-800 dark:text-amber-400" aria-hidden="true" />
              <h2 className="text-lg font-bold text-[#0F1E36] dark:text-white">
                Confidential Private Accessibility Requests ({privateSupport.length})
              </h2>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300">
              Stored in segregated confidential storage. Never exposed to employers without explicit per-job learner consent.
            </p>
            {privateSupport.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">No private requests recorded.</p>
            ) : (
              <div className="space-y-2">
                {privateSupport.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 p-3.5 text-xs space-y-1"
                  >
                    <div className="font-mono font-bold tabular-nums">
                      Learner Ref: {item.learnerId} · {new Date(item.updatedAt).toLocaleString()}
                    </div>
                    <div>Preferences: {item.supportPreferences.join(', ') || 'None specified'}</div>
                    {item.supportNotes && <div className="text-slate-700 dark:text-slate-300">Note: {item.supportNotes}</div>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 4: ANALYTICS */}
      {!loading && activeTab === 'analytics' && analytics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Organizations', value: analytics.organizationCount },
            { label: 'Total Forms', value: analytics.formCount },
            { label: 'Published Forms', value: analytics.publishedFormCount },
            { label: 'Form Submissions', value: analytics.formSubmissionCount },
            { label: 'Registered Learners', value: analytics.learnerCount },
            { label: 'Onboarding Sessions', value: analytics.onboardingSessionCount },
            { label: 'Accessible Jobs', value: analytics.jobCount },
            { label: 'Job Applications', value: analytics.applicationCount },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-1"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {stat.label}
              </p>
              <p className="text-3xl font-extrabold text-[#0F1E36] dark:text-white tabular-nums">
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* TAB 5: ACCOUNT SETTINGS */}
      {!loading && activeTab === 'settings' && (
        <AdminAccountSettingsPanel
          admin={admin}
          organizations={organizations}
          onAdminUpdated={(nextAdmin, msg) => onAdminUpdated(nextAdmin, msg)}
          onSessionExpired={onSessionExpired}
          onLogout={onLogout}
        />
      )}
    </div>
  );
};
