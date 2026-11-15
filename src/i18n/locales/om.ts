import { TranslationDictionary } from '../types';

/**
 * Afaan Oromo (om) Plain-Language Locale
 * Uses standard Qubee Afaan Oromoo orthography.
 * Marked `needsNativeReview: true` for final native-speaker & lived-experience sign-off.
 */
export const om: TranslationDictionary = {
  meta: {
    locale: 'om',
    needsNativeReview: true,
    reviewNote: 'Plain-language Qubee Afaan Oromoo draft. Needs native speaker review.',
  },
  common: {
    skipToContent: 'Gara qabiyyee ijoo darbi',
    demoBannerTitle: 'Haala Agarsiisaa (Demo)',
    demoBannerBody: 'Kun ragaalee fakkeenyaa qofa. Gara sarvara dhugaa hin ergamu, SMSnis hin ergamu.',
    realApiLabel: 'API Walqabate',
    mockApiLabel: 'Haala Agarsiisaa',
    languageLabel: 'Afaan',
    back: 'Duubatti deebi\'i',
    continue: 'Itti fufi',
    skip: 'Gaaffii kana irra darbi',
    reviewAnswers: 'Deebii koo ilaali',
    submit: 'Galmee ergi',
    edit: 'Sirreessi',
    save: 'Asitti kuusi',
    retry: 'Irra deebi\'ii yaali',
    loadingStatus: 'Fe\'aa jira, maaloo eegaa…',
    optionalBadge: 'Filannoo (darbuun ni danda\'ama)',
    whyWeAskLabel: 'Maaliif kana gaafanna?',
    readAloud: 'Gaafficha sagaleedhaan dubbisi',
    stopReading: 'Dubbisuu dhaabi',
    readAloudUnavailable: 'Afaan kanaaf sagaleen sirrii ta\'e amma hin argamne. Barreeffama fuula irraa dubbisuu ni dandeessu.',
    loadingAudio: 'Sagalee uumamaa qopheessaa jira…',
    stepOf: 'Tarkaanfii {current} / {total}',
    noTimeoutNotice: 'Daangaan yeroo hin jiru. Deebiin keessan hanga xumurtanitti asitti tura.',
    errorSummaryTitle: 'Itti fufuun dura waan tokko mirkaneessaa',
    darkModeLabel: 'Haala Dukkanaa',
    lightModeLabel: 'Haala Ifaa',
    easyReadOn: 'Ilaalcha salphaa: Banaa', // needs native review
    easyReadOff: 'Ilaalcha salphaa', // needs native review
    offlineNotice: 'Quunnamtiin citeera. Deebiin keessan fuula kana irra jira; yeroo deebi\'u irra deebi\'ee yaala.', // needs native review
    onlineRetryNotice: 'Quunnamtiin deebi\'eera.', // needs native review
  },
  nav: {
    gateway: 'Fuula Duraa',
    onboarding: 'Galmee',
    profile: 'Piroofayilii koo', // needs native review
    careers: 'Hojiiwwan Mijatoo',
    learning: 'Qabeenya Barnootaa', // needs native review
    dashboard: 'Daashboordii', // needs native review
    employers: 'Hojjechiistotaaf',
    formBuilder: 'Ijaarsa Unkaa', // needs native review
    judgeChecklist: 'Tarree Mirkaneessaa',
    startAction: 'Galmee Jalqabi',
    themeSettings: 'Bifa fi API',
    voiceAssistant: 'Gargaaraa Sagalee',
  },
  home: {
    headline: 'Galmee salphaa fi carraa hojii mijataa, gaaffii tokko tokkoon.',
    subtitle:
      'Waraqaa eenyummaa gandaa ykn paaspoortii malee galmaa\'uu dandeessu. Sagaleedhaan ykn barreeffamaan deebisaa, hojii deeggarsa iddoo hojii qabu barbaadaa.',
    onboardingCardTitle: 'Akka barataatti galmaa\'i',
    onboardingCardBody:
      'Fuula tokko irratti gaaffii gabaabaa tokko. Sagaleedhaan ykn barreeffamaan deebisaa, gaaffii barbaachisaa hin taane irra darbaa.',
    onboardingCardCta: 'Galmee jalqabi',
    careerCardTitle: 'Hojiiwwan mijatoo ilaali',
    careerCardBody:
      'Ragaa fayyaa osoo hin gaafatamin haala mijataa iddoo hojiitiin hojiiwwan barbaadaa fi unka kanaan iyyadhaa.',
    careerCardCta: 'Hojii barbaadi',
    partnerModeCta: 'Galmee gargaarsa dhaabbata michuu',
    employerModeCta: 'Hojjechiisaaf: deeggarsa hojii galmeessi',
    promiseTitle: 'Waadaa iccitii fi dhaqqabummaa keenyaa',
    promiseItems: [
      'Waraqaan eenyummaa gandaa, paaspoortiin ykn ragaan yaalaa hin barbaachisu.',
      'Filannoon deeggarsa dhuunfaa keessanii hayyama keessan malee hojjechiisaatti hin mul\'atu.',
      'Bilbila waliinii fayyadamtu yoo ta\'e, deebiin keessan bilbila irratti hin kuufamu.',
    ],
    navGuide: {
      badge: 'Qajeelfama Dhaqqabummaa', // needs native review
      title: 'Akkaataa Itti Fayyadama Sagalee fi Furtuu Gabatee', // needs native review
      subtitle: 'Sagaleedhaan ykn qaxxaamura furtuu gabateetiin fuula hundarra ofiin socho\'aa.', // needs native review
      keyboardHeading: 'Sochii furtuu gabatee', // needs native review
      keyboardItems: [
        { keys: 'Tab', description: 'Gara wanta hojii itti aanutti darbaa, ibsa isaas dhaggeeffadhaa.' }, // needs native review
        { keys: 'Shift + Tab', description: 'Gara wanta duraatti deebi\'aa, ibsa isaas dhaggeeffadhaa.' }, // needs native review
        { keys: 'Enter', description: 'Wanta xiyyeeffannoo irra jiru banaa ykn hojiirra oolchaa.' }, // needs native review
        { keys: 'Ctrl + Shift + A', description: 'Gargaaraa sagalee Gemini Live eegalaa ykn dhaabaa.' }, // needs native review
      ],
      voiceHeading: 'Gargaaraa sagalee', // needs native review
      voiceItems: [
        { phrase: '"Hey Access"', description: 'Yeroo maayikiroofooniin kakaastuu banaa jiru gargaaraa banuuf kana jedhaa.' }, // needs native review
        { phrase: 'Uumamaan dubbadhaa', description: 'Fuulota banuuf, unka guutuuf ykn hojii barbaaduuf sagaleedhaan dubbadhaa.' }, // needs native review
        { phrase: 'Gargaarsa fuulaa', description: 'Yeroo gargaarsa barbaaddan gargaaraan fuula akka dubbisu ykn ibsu gaafadhaa.' }, // needs native review
        { phrase: '"Goodbye" / "Stop listening"', description: 'Haasawa dhaabuuf jechoota kana keessaa tokko dubbadhaa.' }, // needs native review
      ],
      learnMoreButton: 'Akkaataa weebsaayitii kana itti fayyadaman baradhaa', // needs native review
      hideGuideButton: 'Qajeelfama dhoksi', // needs native review
      detailedTitle: 'Gorsa dhaqqabummaa tarkaanfii tarkaanfiin', // needs native review
      detailedSteps: [
        'Qabduu, geessituu ykn saanduqa unkaa hunda dhaggeeffachuuf Tab fi Shift + Tab fayyadamaa. Filannoo mallatteessuuf Space, tarree keessatti ammoo furtuu xiyyaa fayyadamaa.', // needs native review
        'Gargaaraa sagalee Gemini Live eegaluuf Ctrl + Shift + A (ykn Ctrl + Tab) tuqaa. Yeroo barbaaddanitti dhaabuuf irra deebi\'aa Ctrl + Shift + A tuqaa.', // needs native review
        'Foddaa gargaaraa banuuf/cufuuf Alt + Shift + A, kakaastuu sagalee to\'achuuf Alt + Shift + M, bakka jirtan dhaggeeffachuuf Alt + Shift + L tuqaa.', // needs native review
      ],
      detailedPrivacyNote: 'Eegumsa iccitii: Saanduqni jecha iccitii fi eenyummaa gonkumaa sagaleedhaan hin dubbifamu.', // needs native review
    },
  },
  voice: {
    startMic: 'Maayikiroofoonii bani',
    stopMic: 'Maayikiroofoonii dhaabi',
    listeningState: 'Dhaggeeffachaa jira… amma ifatti dubbadhaa',
    transcribingState: 'Sagalee gara barreeffamaatti jijjiiraa jira…',
    transcriptLabel: 'Waan dhagahame ilaalaa (barreeffama kana sirreessuu dandeessu)',
    useThis: 'Barreeffama kana fayyadami',
    tryAgain: 'Irra deebi\'ii yaali',
    discard: 'Haqi',
    unsupportedMessage: 'Fudhattuun sagalee biraawuzarii kana irratti hin hojjetu. Maaloo gadiitti barreeffamaan guutaa.',
    permissionDeniedMessage: 'Hayyamni maayikiroofoonii hin kennamne. Qindaa\'ina biraawuzarii keessatti hayyamaa ykn barreeffamaan guutaa.',
    noAudioStoredNote: 'Sagaleen gara barreeffamaatti jijjiiramee battalumatti haqama; hin kuufamu.',
    sensitiveDisabledTitle: 'Lakkoofsa eenyummaaf sagaleen cufameera',
    sensitiveDisabledBody: 'Nageenya keessan eeguuf maaloo lakkoofsicha harkaan barreessaa.',
    readToAssistantOption: 'Gargaaraa michuu amanamaa kootiif sagaleedhaan dubbisee hima',
    readToAssistantReminder: 'Yaadachiisa: Yoo ol kaastanii dubbistan namoonni naannoo jiran dhagahuu danda\'u.',
    detectedLanguageLabel: 'Afaan adda baafame',
    permissionPromptNote: 'Yeroo biraawuzarri hayyama maayikiroofoonii gaafatu "Allow" filadhaa. Sagaleen hin kuufamu.',
    retryMic: 'Maayikiroofoonii irra deebi\'ii yaali',
    emptySpeechError: 'Sagaleen hin dhagamne. Irra deebi\'uuf maayikiroofoonii bani tuqaa ykn barreessaa.',
    fallbackEnglishButton: 'Ingiliffaan dubbadhu',
    voiceNoteFallbackNotice: 'Interneetii malee: yaadannoon sagalee yeroof fuula kana irratti qofa qabameera.', // needs native review
  },
  voiceAssistant: {
    title: 'Gargaaraa Sagalee Afaanota Sadii',
    subtitle: 'Afaan Oromoo, Amaariffa (አማርኛ) ykn Ingiliffaan dubbadhaa ykn barreessaa.',
    openButton: 'Gargaaraa Sagalee',
    closeButton: 'Gargaaraa cufi',
    minimizeButton: 'Haasawa xiqqeessi',
    expandButton: 'Haasawa bal\'isi',
    dockLeftLabel: 'Gara bitaatti siqi',
    dockRightLabel: 'Gara mirgaatti siqi',
    actionHistoryTitle: 'Gochaalee Weebsaayitii Dhiyoo',
    shortcutHint: 'Live jijjiiruuf: Ctrl+Shift+A · Qaxxaamura sagalee: Ctrl+Alt+Shift+A',
    liveStoppedNotice: 'Gemini Live dhaabbatee maayikiroofooniin gadhiifameera.',
    statusBadges: {
      idle: 'Boqonnaa (Idle)',
      listening: 'Dhaggeeffachaa jira',
      processing: 'Hojjechaa jira',
      speaking: 'Dubbachaa jira',
    },
    autoDetectLabel: 'Afaan dubbatame ofumaan adda baasi (EN / AM / OM)',
    speakOrTypePrompt: 'Waa\'ee galmee, filannoo eenyummaa ykn hojii mijataa gaafadhaa',
    inputPlaceholder: 'Barreessaa ykn maayikiroofooniin dubbadhaa…',
    sendButton: 'Ergi',
    speakButton: 'Dubbadhu',
    stopSpeakingButton: 'Sagalee dhaabi',
    thinkingStatus: 'Yaadaa jira…',
    speakingStatus: 'Dubbachaa jira…',
    clearChat: 'Qulqulleessi',
    emptyState: 'Afaan Oromoo, አማርኛ ykn Ingiliffaan dubbadhaa ykn barreessaa. Afaanuma sanaan isiniif deebisa.',
    switchedLanguageNotice: 'Afaan gara {language}tti jijjiirameera',
    providerBadgeNeural: 'Sagalee Uumamaa Afaanota Sadii (EN / AM / OM)',
    providerBadgeBrowser: 'Sagalee Biraawuzarii (Ingiliffa qofa)',
    providerUnavailable: 'Afaan kanaaf sagaleen dhugaa amma hin jiru. Deebii barreeffamaa armaan olii dubbisaa.',
    handsFreeGreeting: 'Akkam! Dhaggeeffachaa jira. Akkamitti isin gargaaruu danda\'a?', // needs native review
    handsFreeGoodbye: 'Nagaatti! Yeroo biraa yeroo barbaaddan "Hey Access" jedhaa.', // needs native review
    unclearSpeechRetry: 'Sirriitti hin dhagahamne. Maaloo irra deebi\'aa dubbadhaa ykn dhaabuuf "Nagaatti" jedhaa.', // needs native review
    quotaReachedNotice: 'Daangaan AI yeroof guuteera. To\'annoo weebsaayitii keessaa fayyadamaa jira.', // needs native review
    stateLabels: {
      waiting: 'Jecha kakaastuu eegaa jira', // needs native review
      activated: 'Banameera', // needs native review
      listening: 'Dhaggeeffachaa jira', // needs native review
      processing: 'Hojjechaa jira', // needs native review
      responding: 'Deebisaa jira', // needs native review
      active_conversation: 'Haasawa itti fufaa', // needs native review
      ended: 'Xumurameera', // needs native review
    },
  },
  voiceTrigger: {
    buttonPrefix: 'Kakaastuu Sagalee', // needs native review
    statusListening: 'Dhaggeeffachaa jira', // needs native review
    statusPaused: 'Yeroof dhaabbate', // needs native review
    statusMuted: 'Cufamaa', // needs native review
    statusUnsupported: 'Hin deggeramu', // needs native review
    wakePhraseLabel: '"{phrase}" jedhaa', // needs native review
    ariaListening: 'Kakaastuun sagalee harka malee "{phrase}" dhaggeeffachaa jira. Cufuuf tuqaa.', // needs native review
    ariaPaused: 'Kakaastuun sagalee yeroo Gargaaraan Sagalee banamu ni dhaabbata. Cufuuf tuqaa.', // needs native review
    ariaMuted: 'Kakaastuun sagalee cufamaa jira. "{phrase}" dhaggeeffachuuf tuqaa.', // needs native review
    ariaUnsupported: 'Kakaastuun sagalee biraawuzarii kana ykn sarara HTTPS hin taane irratti hin hojjetu.', // needs native review
    announcedListening: 'Maayikiroofooniin "{phrase}" dhaggeeffachuuf banaa jira.', // needs native review
    announcedMuted: 'Kakaastuun sagalee cufameera.', // needs native review
    announcedTriggered: '"{phrase}" dhagahameera. Gargaaraa Sagalee banaa jira.', // needs native review
    announcedPaused: 'Yeroo Gargaaraan Sagalee banamu dhaggeeffachuun yeroof dhaabbateera.', // needs native review
    errorPermissionDenied: 'Hayyamni maayikiroofoonii dhorkameera. Qindaa\'ina biraawuzarii keessatti hayyamaa irra deebi\'aa yaalaa.', // needs native review
    errorAudioCapture: 'Maayikiroofooniin hojjetu hin argamne ykn appii biraatiin qabameera.', // needs native review
    errorNetwork: 'Walqunnamtiin dhaggeeffataa sagalee citeera. Irra deebi\'uuf tuqaa.', // needs native review
    errorLanguageUnsupported: 'Afaan kanaaf dhaggeeffannaan itti fufaa hin deggeramu.', // needs native review
    errorBrowserUnsupported: 'Biraawuzariin kun dhaggeeffannaa sagalee itti fufaa hin deggeru. Qabduu Gargaaraa Sagalee fayyadamaa.', // needs native review
    errorHttpsRequired: 'Dhaggeeffannaan sagalee sarara HTTPS nageenya qabu barbaada.', // needs native review
    dismissError: 'Ergaa kana cufi', // needs native review
  },
  saveResume: {
    panelTitle: 'Kuusiitii yeroo biraa itti fufi',
    sharedPhoneQuestion: 'Kun bilbila waliinii ykn kompiitara uummataa ti?',
    sharedPhoneYes: 'Eeyyee, bilbila waliinii ti',
    sharedPhoneNo: 'Lakki, bilbila koo dhuunfaa ti',
    sharedPhoneWarning: 'Bilbila waliinii waan ta\'eef homtuu bilbila irratti hin kuufamu. Fuula kana yoo cufan ni bada.',
    saveOnPhoneButton: 'Deebii iccitii hin taane bilbila kana irratti kuusi',
    saveOnPhoneExplain: 'Maqaa fi filannoo qunnamtii qofa bilbila kana irratti kuusa. Lakkoofsi eenyummaa fi deeggarsi dhuunfaa hin kuufaman.',
    deleteSavedButton: 'Deebii koo kuufame haqi',
    deletedConfirm: 'Deebiin bilbila kana irratti kuufame hundi haqameera.',
    resumeFoundTitle: 'Wixinni bilbila kana irratti kuufame argameera',
    resumeFoundBody: 'Gaafa {date} kuufame. Lakkoofsi eenyummaa fi deeggarsi dhuunfaa hin kuufamne.',
    resumeButton: 'Kan kuufame itti fufi',
    statusMemoryOnly: 'Yaadannoo yerootiin qofa qabameera (yoo cufame ni bada)',
    statusDeviceSaved: 'Deebiin iccitii hin taane bilbila kana irratti qofa kuufameera',
    statusServerSaved: 'Sarvara irratti nageenyaan kuufameera',
    statusErrorKeptInMemory: 'Sarvara argachuun hin danda\'amne. Deebiin keessan fuula kana irra jira.',
    smsTitle: 'Liinkii itti fufinsaa SMSn argadhaa',
    smsNotConfigured: 'Tajaajilli SMS ammallee hin qindaa\'in jira. Haala agarsiisaatti SMS hin ergamu.',
    smsPhoneLabel: 'Lakkoofsa bilbilaa liinkii itti fufinsaatiif',
    smsSendButton: 'Liinkii SMS ergi',
    smsSentSuccess: 'Sarvarri gaaffii SMS keessanii fudhateera.',
    exportDataButton: 'Odeeffannoo koo buufadhu (JSON)', // needs native review
    deleteConfirmTitle: 'Piroofayilii fi deebii kuufame haquu?', // needs native review
    deleteConfirmBody: 'Kun deebii keessan meeshaa kana ykn sarvara irraa guutummaatti haqa.', // needs native review
    deleteConfirmYes: 'Eeyyee, hunda haqi', // needs native review
    deleteConfirmCancel: 'Deebii koo tursiisi', // needs native review
  },
  onboarding: {
    pageTitle: 'Galmee Barataa',
    stepDeviceTitle: 'Osoo hin jalqabin dura: kun bilbila waliinii ti?',
    stepDeviceHelp: 'Namoonni biroon bilbila kana ni fayyadamu yoo ta\'e iccitii keessan eeguuf nu gargaara.',
    stepDeviceWhy: 'Odeeffannoon dhuunfaa keessan bilbila waliinii irratti akka hin hafneef gaafanna.',
    stepNameTitle: 'Maqaan keessan guutuun eenyu?',
    stepNameHelp: 'Maqaa leenjistonni isin ittiin waaman barreessaa ykn dubbadhaa.',
    stepNameLabel: 'Maqaa guutuu',
    stepNameWhy: 'Isin simachuu fi galmee barnootaa qopheessuuf maqaa keessan fayyadamna.',
    stepContactTitle: 'Akkamitti isin argachuu dandeenya?',
    stepContactHelp: 'Karaa isiniif mijatu filadhaa ykn gaaffii kana irra darbaa.',
    stepContactMethodLabel: 'Karaa qunnamtii filatamaa',
    stepContactValueLabel: 'Lakkoofsa bilbilaa ykn imeelii',
    stepContactWhy: 'Sagantaa barnootaa fi odeeffannoo galmee isiniif erguuf.',
    contactMethods: {
      phone: 'Bilbila ykn SMS',
      email: 'Imeelii',
      partner_contact: 'Karaa dhaabbata michuu kootiin',
      none: 'Amma qunnamtii kennuu hin barbaadu',
    },
    stepIdentityTitle: 'Filannoo eenyummaa filadhaa',
    stepIdentityHelp: 'Waraqaan eenyummaa gandaa ykn paaspoortiin dirqama miti. Kan haala keessaniif mijatu filadhaa.',
    stepIdentityWhy: 'Namni tokko illee sababa waraqaa eenyummaatiin akka hin hafneef filannoo biraa ni fudhanna.',
    identityRoutes: {
      national_id: {
        label: 'Waraqaa Eenyummaa Biyyaalessaa (Fayda / Gandaa)',
        desc: 'Kaardii ykn lakkoofsa eenyummaa biyyaalessaa yoo qabaattan kana filadhaa.',
      },
      refugee_id: {
        label: 'Waraqaa Eenyummaa Baqataa',
        desc: 'Kaardii galmee baqataa ykn ragaa UN/RRS yoo qabaattan kana filadhaa.',
      },
      other_document: {
        label: 'Waraqaa eenyummaa biraa',
        desc: 'Kaardii barataa, xalayaa hawaasaa ykn ragaa naannoo biroo.',
      },
      no_documents: {
        label: 'Waraqaa kana hin qabu',
        desc: 'Waraqaa eenyummaa malee itti fufaa. Qindeessaan namaa booda mirkaneessuu danda\'a.',
      },
      partner_referral: {
        label: 'Karaa dhaabbata michuutiin na ergaa',
        desc: 'NGO ykn giddugalli hawaasaa galmee keessan mirkaneessuu danda\'a.',
      },
    },
    idNumberLabel: 'Lakkoofsa waraqaa eenyummaa (filannoo)',
    partnerReferralOrgLabel: 'Maqaa dhaabbata michuu (filannoo)',
    stepSupportTitle: 'Deeggarsa barnootaa ykn dhaqqabummaa barbaadduu?',
    stepSupportHelp: 'Gargaarsa isin barbaachisu filadhaa. Ragaa yaalaa ykn dhukkubaa hin gaafannu.',
    stepSupportPrivacyNotice: 'Iccitii: Qindeessaa deeggarsa dhaqqabummaa qofatu arga. Hojjechiistonni gonkumaa hin argan.',
    stepSupportWhy: 'Meeshaa barnootaa mijataa ykn yeroo dabalataa dursinee qopheessuuf.',
    supportOptions: {
      help_completing: 'Galmee guutuuf gargaarsa',
      communication_assistance: 'Gargaarsa walqunnamtii (afaan mallattoo, barreeffama salphaa)',
      alternative_materials: 'Meeshaalee barnootaa filannoo (sagalee, barreeffama guddaa, dubbisaa iskiriinii)',
      flexible_scheduling: 'Yeroo dabalataa ykn sagantaa mijataa',
      other_support: 'Deeggarsa biraa',
      discuss_privately: 'Qindeessaa waliin kophaatti mari\'achuu nan filadha',
    },
    supportNotesLabel: 'Yaada dabalataa waan isin gargaaru (filannoo, ibsi yaalaa hin barbaachisu)',
    stepPartnerConsentTitle: 'Galmee hayyamaa gargaarsa dhaabbata michuu',
    stepPartnerConsentHelp: 'Bakka bu\'aan dhaabbataa waan gargaaruuf, barataan dura dubbisee hayyamuu qaba.',
    stepPartnerConsentWhy: 'Hayyama barataa malee namni biraa odeeffannoo akka hin ergineef eegumsa goona.',
    partnerOrgInputLabel: 'Maqaa dhaabbata michuu',
    partnerRepInputLabel: 'Maqaa guutuu bakka bu\'aa',
    partnerSharedScopeText: 'Bakka bu\'aan michuu maqaa keessan, karaa qunnamtii fi filannoo eenyummaa arguu danda\'a. Yaadannoo deeggarsa dhuunfaa hin argu.',
    partnerConsentCheckbox: 'Barataan maal akka qoodamu hubatee galmeen kun akka ergamu hayyama ifaa kennuu isaa nan mirkaneessa.',
    reviewTitle: 'Deebii keessan ilaalaa fi sirreessaa',
    reviewHelp: 'Erguun dura deebii armaan gadii mirkaneessaa. Jijjiiruuf Sirreessi tuqaa.',
    confirmationTitle: 'Galmeen qophaa\'eera',
    confirmationDemoNote: 'Haala agarsiisaa: Deebiin keessan asitti mirkanaa\'eera; gara sarvara dhugaa hin ergamne.',
    confirmationRealNote: 'Galmeen keessan gara sarvaraatti ergameera.',
    partnerConfirmationNote: 'Dhaabbanni michuu isin qunnama.', // needs native review
    referralNextStepNote: 'Tarkaanfii itti aanu: Qindeessaan dhaabbata michuu galmee keessan mirkaneessee karaa filattaniin isin qunnama.', // needs native review
    editModeTitle: 'Piroofayilii koo sirreessi', // needs native review
    editModeSavedNote: 'Jijjiiramni piroofayilii keessanii kuufameera.', // needs native review
    startCareerFromConfirm: 'Itti aansee hojiiwwan mijatoo ilaali',
    errors: {
      emptyName: 'Saanduqni maqaa duwwaa dha. Itti fufuuf maaloo maqaa keessan barreessaa ykn dubbadhaa.',
      emptyIdentityRoute: 'Filannoon eenyummaa hin filatamne. Maaloo armaan olitti tokko filadhaa.',
      emptyPartnerConsent: 'Saanduqni hayyamaa hin mallatteeffamne. Erguun dura hayyama barataa mirkaneessaa.',
      emptyPartnerOrg: 'Maqaan dhaabbata michuu duwwaa dha. Maaloo maqaa dhaabbatichaa barreessaa.',
      emptyContactValue: 'Odeeffannoon qunnamtii duwwaa dha. Bilbila/imeelii galchaa ykn "kennuu hin barbaadu" filadhaa.',
      invalidEthiopianPhone: 'Lakkoofsa bilbilaa Itoophiyaa sirrii 09, 07 ykn +251n jalqabu galchaa.', // needs native review
    },
  },
  career: {
    pageTitle: 'Balbala Hojii Mijataa',
    pageSubtitle: 'Hojiiwwan deeggarsa iddoo hojii qaban barbaadaa. Filannoon keessan iccitiidhaan iskiriinii keessan irra tura.',
    searchLabel: 'Maqaa hojii, ogummaa ykn magaalaadhaan barbaadi',
    searchPlaceholder: 'Fakkeenya: Tajaajila maamilaa, Finfinnee, fageenya…',
    filterTitle: 'Deeggarsa hojjechiisaan kennuun calali (iccitii)',
    filterPrivacyNote: 'Filannoon calallii keessanii hojjechiistotatti gonkumaa hin mul\'atu.',
    clearFilters: 'Calallii haqi',
    noJobsMatch: 'Amma hojiin calallii kana waliin walsimu hin jiru. Calallii tokko hir\'isaa.',
    accommodationsHeading: 'Deeggarsawwan kennaman',
    skillsHeading: 'Ogummaa barbaachisu',
    deadlineLabel: 'Guyyaa dhumaa iyyannoo',
    applyButton: 'Hojii kanaaf iyyadhu',
    viewDetails: 'Bal\'ina dhaqqabummaa guutuu dubbisi',
    hideDetails: 'Bal\'ina dhoksi',
    jsonLdLabel: 'Schema.org JobPosting JSON-LD hidhameera',
    listenSummary: 'Cuunfaa dhaggeeffadhu', // needs native review
    mySupportFilterLabel: 'Deeggarsa na barbaachisu (filannoo koo kuufame waliin iccitiin wal simsiisi)', // needs native review
    categories: {
      remote_flexible: 'Hojii mana irraa ykn jijjiiramaa',
      flexible_hours: 'Sa\'aatii hojii mijataa',
      screen_reader_tools: 'Meeshaalee dubbisaa iskiriinii waliin hojjetan',
      accessible_workplace: 'Iddoo hojii dhaqqabamaa',
      assistive_tech: 'Deeggarsa teeknooloojii gargaaraa',
      communication_support: 'Deeggarsa walqunnamtii',
      other_accommodations: 'Deeggarsa biraa ibsame',
    },
    applyFlow: {
      titlePrefix: 'Iyyannoo hojii:',
      stepNameTitle: 'Iyyannoo kanaaf maqaa keessan mirkaneessaa',
      stepNameWhy: 'Hojjechiisaan eenyu akka iyyate akka beekuuf.',
      stepContactTitle: 'Hojjechiisaan eessatti isin haa qunnamu?',
      stepContactWhy: 'Odeeffannoo gaaffii fi deebii hojii kanaa qofaaf oola.',
      stepExpTitle: 'Waan hojii kanaaf isin qopheessu nutti himaa',
      stepExpHelp: 'Waa\'ee ogummaa keessanii sagaleedhaan dubbachuu ykn gabaabsitanii barreessuu dandeessu.',
      stepExpWhy: 'Gareen qacaru cimina keessan akka hubatu gargaara.',
      stepConsentTitle: 'Filannoo: deeggarsa gaaffii fi deebii gaafachuu barbaadduu?',
      stepConsentHelp: 'Akka idileetti fedhiin deeggarsa dhuunfaa keessanii hojjechiisaaf hin qoodamu.',
      stepConsentWhy: 'Waan hojjechiisaan argu isinumatu to\'ata.',
      shareToggleLabel: 'Eeyyee, hojii ykn gaaffii fi deebii kanaaf sirreeffama gaafachuu nan barbaada',
      shareNoteLabel: 'Sirreeffamni akkamii isin gargaara? (Fakkeenya: barreeffama gaaffii fi deebii viidiyoo)',
      explicitConsentLabel: 'Yaadannoon sirreeffamaa kun hojjechiisaatti akka ergamu hayyama ifaa nan kenna.',
      submittedTitle: 'Iyyannoon galmaa\'eera',
      submittedBodyDemo: 'Haala agarsiisaa: Iyyannoon keessan agarsiisaaf qofa galmaa\'eera. Gara hojjechiisaa dhugaa hin ergamne.',
      submittedBodyReal: 'Iyyannoon keessan gara hojjechiisaatti ergameera.',
      backToJobs: 'Gara hojiiwwan mijatootti deebi\'i',
    },
  },
  employer: {
    pageTitle: 'Unka Deeggarsa Hojjechiisaa',
    pageSubtitle: 'Deeggarsa dhaabbanni keessan kennu ibsaa. Iyyattoota ragaa yaalaa ykn dhukkubaa gonkumaa hin gaafatinaa.',
    safeguardBannerTitle: 'Seera iccitii fi haqummaa',
    safeguardBannerBody:
      'Saanduqni kam iyyuu ragaa yaalaa, dhukkuba ykn gosa qaama miidhamummaa yoo gaafate maxxansuun ni dhorkama.',
    blockedPublishTitle: 'Maxxansuun dura jechoota yaalaa ykn dhukkubaa haqaa',
    jobTitleLabel: 'Maqaa hojii',
    orgNameLabel: 'Maqaa dhaabbataa',
    locationLabel: 'Magaalaa / Bakka',
    remoteCheckbox: 'Mana irraa hojjechuun ni danda\'ama',
    employmentTypeLabel: 'Gosa hojii',
    summaryLabel: 'Ibsa hojii afaan salphaadhaan',
    skillsLabel: 'Ogummaa barbaachisu (qoodduudhaan adda baasaa)',
    workEnvLabel: 'Dhaqqabummaa naannoo hojii',
    remoteFlexLabel: 'Haala hojii mana irraa ykn jijjiiramaa',
    assistiveTechLabel: 'Teeknooloojii gargaaraa jiru',
    commOptionsLabel: 'Filannoo walqunnamtii',
    interviewAccLabel: 'Deeggarsa gaaffii fi deebii',
    appProcessAccLabel: 'Deeggarsa adeemsa iyyannoo',
    additionalSupportLabel: 'Deeggarsa dabalataa kennamu (filannoo)',
    publishButton: 'Beeksisa hojii mijataa maxxansi',
    publishedSuccess: 'Beeksisni hojii Schema.org JSON-LD waliin Balbala Hojii irratti maxxanfameera.',
    viewPublishedInGateway: 'Beeksisa Balbala Hojii irratti ilaali',
  },
  orientation: {
    whereAmIButton: 'Eessan jira?', // needs native review
    whatCanIDoButton: 'Asitti maal gochuu danda\'a?', // needs native review
    autoSpeechOn: 'Qajeelfama Sagalee Fuulaa: Banaa', // needs native review
    autoSpeechOff: 'Qajeelfama Sagalee Fuulaa: Cufaa', // needs native review
    announceNowAria: 'Bakka fuula keessanii fi gochaalee jiran sagaleedhaan dhageessisaa', // needs native review
  },
  learning: {
    pageTitle: 'Qabeenya Barnootaa', // needs native review
    pageSubtitle: 'Koorsiiwwan ALX Software Engineering, Data Science fi AI meeshaa dubbisaa screen-reader fi ibsa sagalee waliin.', // needs native review
    filterAll: 'Koorsiiwwan Hunda', // needs native review
    hubBadge: 'Giddugala ALX Finfinnee · Screen-Reader Qophaa\'aa', // needs native review
    listenGuideLabel: 'Ibsa koorsii dhaggeeffadhu', // needs native review
    assistiveTipsHeading: 'Yaadannoo teeknooloojii gargaaraa', // needs native review
  },
  dashboard: {
    pageTitle: 'Daashboordii Fayyadamaa', // needs native review
    pageSubtitle: 'Haala galmee keessanii, qindaa\'ina mijataa, eegumsa DOM fi qabduu ariifachiisaa ilaalaa.', // needs native review
    statusHeading: 'Haala Galmee fi Piroofayilii', // needs native review
    preferencesHeading: 'Qindaa\'ina Dhaqqabummaa Banaa', // needs native review
    securityHeading: 'Eegumsa Nageenyaa fi Iccitii', // needs native review
    domShieldBadge: 'Haguuggiin DOM Password fi Proxy Sarvaraa Hojii Irra Jira', // needs native review
    quickLinksHeading: 'Qajeelfama Ariifachiisaa', // needs native review
  },
  footer: {
    regionLabel: 'Miila Fuulaa Dhaqqabummaa, Odeeffannoo ALX fi Qajeelfamaa', // needs native review
    aboutAlxHeading: 'Waa\'ee ALX', // needs native review
    aboutAlxBody:
      'ALX Afrikaa keessatti carraa hojii teeknooloojii guddisuuf Software Engineering, Data Science fi AI irratti leenjii sadarkaa addunyaa kenna; hawaasa Afrikaa maraa fi giddugala Finfinnee qaba.', // needs native review
    addisHubBadge: 'Giddugala Teeknooloojii Finfinnee · Hawaasa Afrikaa', // needs native review
    exploreLearningBtn: 'Qabeenya Barnootaa ALX Banaa', // needs native review
    linksHeading: 'Dhaqqabummaa fi Seera', // needs native review
    accessibilityStmt: 'Ibsa Dhaqqabummaa', // needs native review
    feedbackForm: 'Yaada Dhaqqabummaa', // needs native review
    privacyPolicy: 'Imaammata Iccitii', // needs native review
    termsOfService: 'Haala Tajaajilaa', // needs native review
    assistantStatusHeading: 'Haala Kallattii Gargaaraa Sagalee', // needs native review
    voiceStatusLabel: 'Kakaastuu Sagalee Harka Malee', // needs native review
    languageHeading: 'Jijjiirraa Afaanii Ariifachiisaa', // needs native review
    bilingualEnBtn: 'English',
    bilingualAmBtn: 'አማርኛ (Amharic)',
    openAssistantBtn: 'Gargaaraa Eegali', // needs native review
    modalCloseLabel: 'Cufi', // needs native review
    feedbackCategoryLabel: 'Mata duree ykn gufuu qunname', // needs native review
    feedbackMessageLabel: 'Yaada keessan barreessaa (password, PIN ykn token hin galchinaa)', // needs native review
    feedbackSubmitBtn: 'Yaada dhaqqabummaa ergi', // needs native review
    feedbackSuccessNotice: 'Galatoomaa. Yaadni dhaqqabummaa keessan galmaa\'eera.', // needs native review
  },
  formBuilder: {
    loginTitle: 'Bulchiinsa Ijaarsa Unkaa', // needs native review
    loginSubtitle:
      'Iddoo bulchiinsa daangeffamaa. Unkaalee dhaabbilee, gaaffiiwwanii fi adeemsa hojii bulchuu kan danda\'an bulchitoota Savanna Gateway hayyamaman qofa.', // needs native review
    restrictedBadge: 'Bulchitoota Hayyamamaniif Qofa', // needs native review
    usernameLabel: 'Maqaa fayyadamaa bulchaa', // needs native review
    passwordLabel: 'Jecha iccitii', // needs native review
    showPassword: 'Jecha iccitii mul\'isi', // needs native review
    hidePassword: 'Jecha iccitii dhoksi', // needs native review
    signInButton: 'Seeni', // needs native review
    signingIn: 'Seenaa jira…', // needs native review
    invalidCredentials: 'Maqaan fayyadamaa ykn jechi iccitii bulchaa sirrii miti. Maaloo mirkaneessaa irra deebi\'aa yaalaa.', // needs native review
    usernameRequired: 'Maaloo maqaa fayyadamaa bulchaa galchaa.', // needs native review
    passwordRequired: 'Maaloo jecha iccitii keessan galchaa.', // needs native review
    sessionExpired: 'Yeroon tursiisaa bulchaa dhumeera ykn baatanii jirtu. Maaloo irra deebi\'aa seenaa.', // needs native review
    backToGateway: 'Gara Savanna Gateway deebi\'i', // needs native review
    checkingSession: 'Hayyama bulchaa mirkaneessaa jira…', // needs native review
    setupTitle: 'Jijjiirraa Jecha Iccitii Dirqamaa', // needs native review
    setupSubtitle:
      'Nageenyaaf jecha, gara Ijaarsa Unkaa seenuun dura maqaa fayyadamaa fi jecha iccitii jalqabaa jijjiiruu qabdu.', // needs native review
    currentUsernameLabel: 'Maqaa fayyadamaa ammaa', // needs native review
    newUsernameLabel: 'Maqaa fayyadamaa haaraa', // needs native review
    currentPasswordLabel: 'Jecha iccitii ammaa', // needs native review
    newPasswordLabel: 'Jecha iccitii haaraa', // needs native review
    confirmNewPasswordLabel: 'Jecha iccitii haaraa mirkaneessi', // needs native review
    saveChangesButton: 'Jijjiirama Kuusi', // needs native review
    savingChanges: 'Odeeffannoo haaromsaa jira…', // needs native review
    passwordRulesHint:
      'Yoo xiqqaate arfii 10 qubee guddaa, qubee xiqqaa, lakkoofsaa fi mallattoo addaa of keessaa qabu fayyadamaa. Jecha iccitii jalqabaa hin irra deebi\'inaa.', // needs native review
    passwordWeakError:
      'Jechi iccitii haaraan arfii 10 ol ta\'uu fi qubee guddaa, xiqqaa, lakkoofsa fi mallattoo qabaachuu qaba.', // needs native review
    passwordMismatchError: 'Jechi iccitii haaraanii fi mirkaneessi wal hin simne.', // needs native review
    credentialsUpdatedNotice: 'Odeeffannoon seenumsaa bulchaa nageenyaan haaromfameera. Baga gara Ijaarsa Unkaa dhuftan.', // needs native review
    workspaceBadge: 'Iddoo Hojii Ijaarsa Unkaa Eegamaa', // needs native review
    workspaceTitle: 'Koonsoolii Dhaabbataa fi Ijaarsa Unkaa', // needs native review
    logoutButton: 'Bahi', // needs native review
    tabs: {
      forms: 'Unkaalee fi Gulaalaa', // needs native review
      organizations: 'Dhaabbilee', // needs native review
      submissions: 'Galmeewwan Ergame', // needs native review
      analytics: 'Xiinxala', // needs native review
      settings: 'Qindaa\'ina Herregaa', // needs native review
    },
    accountSettingsTitle: 'Qindaa\'ina Herrega Bulchaa', // needs native review
    accountInfoTitle: 'Ibsa Herregaa', // needs native review
    roleLabel: 'Gahee bulchaa', // needs native review
    assignedOrgLabel: 'Dhaabbata ramadame', // needs native review
    lastLoginLabel: 'Seenumsa dhumaa', // needs native review
    changeCredentialsTitle: 'Maqaa Fayyadamaa fi Jecha Iccitii Jijjiiri', // needs native review
    createOrgTitle: 'Dhaabbata Haaraa Uumi', // needs native review
    createFormButton: 'Unka Haaraa Uumi', // needs native review
    saveDraftButton: 'Wixinee Kuusi', // needs native review
    publishButton: 'Maxxansi', // needs native review
    archiveButton: 'Kuusaa keessa kaa\'i', // needs native review
    versionHistoryTitle: 'Seenaa Maxxansaalee', // needs native review
    addSectionButton: 'Kutaa Dabali', // needs native review
    addQuestionButton: 'Gaaffii Dabali', // needs native review
    previewPublicLinkLabel: 'Liinkii unka maxxanfamee', // needs native review
    questionTypes: {
      text: 'Barreeffama Gabaabaa / Dheeraa', // needs native review
      email: 'Teessoo Imeelii', // needs native review
      phone: 'Lakkoofsa Bilbilaa', // needs native review
      number: 'Lakkoofsa', // needs native review
      date: 'Guyyaa', // needs native review
      dropdown: 'Filannoo Gad-bu\'aa (Dropdown)', // needs native review
      radio: 'Filannoo Tokkoo (Radio)', // needs native review
      checkbox: 'Filannoo Hedduu (Checkbox)', // needs native review
      yes_no: 'Eeyyee / Lakki', // needs native review
      file: 'Faayila Ol-kaa\'uu (Eegamaa)', // needs native review
      address: 'Teessoo', // needs native review
      consent: 'Waliigaltee Hayyamaa', // needs native review
    },
  },
  auth: {
    signInTitle: 'Gara Savanna Gateway Seenaa', // needs native review
    registerTitle: 'Herrega Barataa ykn Hojjechiisaa Uumi', // needs native review
    signInButton: 'Seeni', // needs native review
    registerButton: 'Herrega Uumi', // needs native review
    signOutButton: 'Bahi', // needs native review
    usernameOrEmailLabel: 'Maqaa fayyadamaa ykn imeelii', // needs native review
    emailLabel: 'Teessoo imeelii', // needs native review
    fullNameLabel: 'Maqaa guutuu', // needs native review
    roleLabel: 'Gosa herregaa', // needs native review
    roleLearner: 'Barataa / Hojii Barbaadaa', // needs native review
    roleEmployer: 'Hojjechiisaa / Dhaabbata Michuu', // needs native review
    passwordLabel: 'Jecha iccitii', // needs native review
    signedInAs: 'Kan seene', // needs native review
    guestStatus: 'Akka keessummaatti fayyadamaa jirtu (seenuun dirqama miti)', // needs native review
  },
};
