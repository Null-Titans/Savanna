import { GatewayModule, SupportedLanguage } from '../types/gateway';

export interface PageOrientationSpec {
  title: string;
  locationAnnouncement: string;
  landmarks: string;
  actions: string[];
}

type OrientationDictionary = Record<GatewayModule, PageOrientationSpec>;

export const PAGE_ORIENTATION_SPECS: Record<SupportedLanguage, OrientationDictionary> = {
  en: {
    home: {
      title: 'Home — Savanna & ALX Accessibility Gateway',
      locationAnnouncement:
        'You are on the Home page of the Savanna and ALX Accessibility Gateway.',
      landmarks:
        'Top navigation links switch pages, the utility bar controls Dark Mode, Language, Easy Read, and Voice Assistant, the main banner introduces registration and jobs, and the footer holds ALX info and accessibility tools.',
      actions: [
        'Select "Start registration" to sign up in easy steps without mandatory Kebele ID.',
        'Select "Explore accessible jobs" to search inclusive roles with workplace accommodations.',
        'Open Learning Resources or Your Dashboard from the navigation bar, or say "Hey Access" when Wake Mic is active.',
      ],
    },
    onboarding: {
      title: 'Accessible Learner Registration',
      locationAnnouncement:
        'You are on the Learner Registration page, a step-by-step accessible onboarding flow.',
      landmarks:
        'A progress bar shows your current step, the central form panel holds one clear question at a time, Read Aloud speaks any question, and Save and Resume controls sit below.',
      actions: [
        'Confirm whether this device is shared before saving answers.',
        'Type or speak your name, contact choice, and ID route—including Partner Referral if you have no document.',
        'Choose optional support needs privately on the support step or skip cleanly.',
      ],
    },
    profile: {
      title: 'My Profile — Edit Saved Details',
      locationAnnouncement:
        'You are on My Profile, where you can review or update your saved learner profile.',
      landmarks:
        'Your saved non-sensitive registration steps appear in edit mode inside the main region, alongside JSON export and full delete controls.',
      actions: [
        'Update your name, contact preference, or identity route safely.',
        'Download a JSON copy of your saved profile or permanently delete stored answers.',
      ],
    },
    career: {
      title: 'Accessible Jobs & Career Gateway',
      locationAnnouncement:
        'You are on the Accessible Jobs and Career Gateway page.',
      landmarks:
        'Top controls include a text search box, Speak to Filter Jobs voice filter, and local-only Support I Need accommodation checkboxes. Job cards and accessible Apply buttons sit below.',
      actions: [
        'Filter jobs by accommodations such as Remote work, Screen-reader tools, or Sign-language interpretation.',
        'Use "Speak to Filter Jobs" to filter hands-free by voice.',
        'Listen to any job summary or select Apply to submit without medical proof.',
      ],
    },
    learning: {
      title: 'Learning Resources — ALX & Accessible Training',
      locationAnnouncement:
        'You are on the Learning Resources page featuring ALX and partner accessible courses.',
      landmarks:
        'Track filter buttons organize Software Engineering, Data Science, AI Career Essentials, and Screen-Reader skills. Each course card offers audio summaries and screen-reader study tips.',
      actions: [
        'Filter learning tracks by topic or accessibility format.',
        'Select "Read aloud" on any course to hear its curriculum and assistive-tech notes.',
        'Open User Dashboard to track your saved learning and accessibility setup.',
      ],
    },
    dashboard: {
      title: 'User Dashboard — Preferences & Progress',
      locationAnnouncement:
        'You are on your User Dashboard summarizing your registration status, saved accessibility settings, and quick actions.',
      landmarks:
        'Summary cards display your onboarding status, active accessibility modes, voice assistant status, and privacy shield status, followed by one-click jump buttons.',
      actions: [
        'Toggle Dark Mode, Easy Read, or Language from quick controls.',
        'Jump straight to Edit Profile, Accessible Jobs, or Learning Resources.',
        'Review privacy guarantees: password fields stay masked and no audio recordings are stored.',
      ],
    },
    employer: {
      title: 'For Employers — Publish Accessible Roles',
      locationAnnouncement:
        'You are on the For Employers page to publish inclusive jobs with real workplace accommodations.',
      landmarks:
        'A safeguard notice sits at top explaining that medical proof requests are blocked, followed by job details and accommodation input fields.',
      actions: [
        'Describe workplace accessibility, interview accommodations, and assistive tools offered.',
        'Publish the role directly to the Accessible Jobs catalog.',
      ],
    },
    form_builder: {
      title: 'Form Builder Administration',
      locationAnnouncement:
        'You are on the Form Builder Administration area. Authorized administrator sign-in is required before viewing or editing forms.',
      landmarks:
        'When signed out, the login form sits in the center. Once signed in, tabs switch between Forms, Organizations, Submissions, Analytics, and Account Settings.',
      actions: [
        'Sign in with authorized administrator credentials to manage organization forms.',
        'Create accessible multilingual forms, preview published links, or update your admin credentials in Account Settings.',
      ],
    },
    judge: {
      title: 'WCAG 2.2 AA & Hackathon Demo Checklist',
      locationAnnouncement:
        'You are on the Demo Verification Checklist page.',
      landmarks:
        'Checklist cards summarize accessibility criteria, privacy safeguards, and direct jump links to each feature.',
      actions: [
        'Jump to any platform module to test keyboard, screen reader, and voice flows.',
        'Open Theme & API settings to switch Demo Mock mode or simulate offline resilience.',
      ],
    },
  },
  am: {
    home: {
      title: 'መነሻ — ሳቫና እና ALX ተደራሽ መግቢያ', // needs native review
      locationAnnouncement: 'እርስዎ በሳቫና እና ALX ተደራሽ መድረክ መነሻ ገጽ ላይ ነዎት።', // needs native review
      landmarks:
        'ከላይ ዋና የገጽ ማውጫዎች፣ የቋንቋ እና የጨለማ ሁነታ አሞሌ ይገኛሉ። በመሃል የምዝገባ እና የስራ አማራጮች፣ ከታች ደግሞ ስለ ALX እና የተደራሽነት መረጃ ይገኛሉ።', // needs native review
      actions: [
        'ያለ ቀበሌ መታወቂያ ለመመዝገብ "ምዝገባ ጀምር" የሚለውን ይምረጡ።', // needs native review
        'ተደራሽ ስራዎችን ለማየት "ተደራሽ ስራዎች" የሚለውን ይክፈቱ።', // needs native review
        'ከላይ ካለው አሞሌ የመማሪያ ግብዓቶችን ወይም ዳሽቦርድን ይክፈቱ።', // needs native review
      ],
    },
    onboarding: {
      title: 'የተማሪ ምዝገባ', // needs native review
      locationAnnouncement: 'እርስዎ በደረጃ በደረጃ የተማሪ ምዝገባ ገጽ ላይ ነዎት።', // needs native review
      landmarks: 'የሂደት አመልካች ከላይ፣ አንድ ግልጽ ጥያቄ በመሃል እና የማስቀመጫ አማራጮች ከታች አሉ።', // needs native review
      actions: [
        'መልሶችዎን ከማስቀመጥዎ በፊት የጋራ ስልክ መሆኑን ይምረጡ።', // needs native review
        'ስምዎን፣ የመገናኛ መንገድዎን እና የመታወቂያ አማራጭዎን በጽሁፍ ወይም በድምፅ ያስገቡ።', // needs native review
        'የሚያስፈልግዎትን ድጋፍ በግል ይምረጡ ወይም ይለፉ።', // needs native review
      ],
    },
    profile: {
      title: 'የእኔ መገለጫ', // needs native review
      locationAnnouncement: 'እርስዎ የተቀመጠ መገለጫዎን በሚያስተካክሉበት "የእኔ መገለጫ" ገጽ ላይ ነዎት።', // needs native review
      landmarks: 'የምዝገባ መልሶችዎ፣ የJSON ማውረጃ እና የመሰረዣ ቁልፎች በዋናው ክፍል ይገኛሉ።', // needs native review
      actions: [
        'ስምዎን ወይም የመገናኛ መረጃዎን ያሻሽሉ።', // needs native review
        'የመረጃዎን ቅጂ ያውርዱ ወይም የተቀመጠውን ሙሉ በሙሉ ያጥፉ።', // needs native review
      ],
    },
    career: {
      title: 'ተደራሽ ስራዎች እና የስራ መግቢያ', // needs native review
      locationAnnouncement: 'እርስዎ በተደራሽ ስራዎች እና የስራ መግቢያ ገጽ ላይ ነዎት።', // needs native review
      landmarks: 'ከላይ የፍለጋ ሳጥን፣ በድምፅ የስራ ማጣሪያ እና የድጋፍ አማራጮች አሉ። የስራ ዝርዝሮች ከታች ናቸው።', // needs native review
      actions: [
        'የርቀት ስራ ወይም የስክሪን አንባቢ ድጋፍ ያላቸውን ስራዎች ያጣሩ።', // needs native review
        'የስራ ማጠቃለያዎችን በድምፅ ያዳምጡ እና ያለ ህክምና ማስረጃ ያመልክቱ።', // needs native review
      ],
    },
    learning: {
      title: 'የመማሪያ ግብዓቶች — ALX እና ተደራሽ ትምህርት', // needs native review
      locationAnnouncement: 'እርስዎ የALX ሶፍትዌር ምህንድስና፣ ዳታ ሳይንስ እና AI የመማሪያ ግብዓቶች ገጽ ላይ ነዎት።', // needs native review
      landmarks: 'የትምህርት ዘርፍ ማጣሪያዎች ከላይ እና ተደራሽ የኮርስ መመሪያ ካርዶች ከታች ይገኛሉ።', // needs native review
      actions: [
        'የኮርስ ማጠቃለያዎችን በድምፅ ያዳምጡ።', // needs native review
        'የስክሪን አንባቢ እና የተደራሽነት ምክሮችን ይመልከቱ።', // needs native review
      ],
    },
    dashboard: {
      title: 'የተጠቃሚ ዳሽቦርድ', // needs native review
      locationAnnouncement: 'እርስዎ የምዝገባ ሁኔታዎን እና የተደራሽነት ምርጫዎችዎን በሚያሳየው ዳሽቦርድ ገጽ ላይ ነዎት።', // needs native review
      landmarks: 'የሁኔታ ካርዶች እና ፈጣን የገጽ መሸጋገሪያ ቁልፎች በዋናው ክፍል ይገኛሉ።', // needs native review
      actions: [
        'የጨለማ ሁነታ እና ቀላል ንባብ ቅንብሮችን ይቆጣጠሩ።', // needs native review
        'ወደ መገለጫ፣ ተደራሽ ስራዎች ወይም መማሪያ ግብዓቶች በፍጥነት ይሂዱ።', // needs native review
      ],
    },
    employer: {
      title: 'ለአሰሪዎች', // needs native review
      locationAnnouncement: 'እርስዎ አካታች የስራ እድሎችን በሚያትሙበት "ለአሰሪዎች" ገጽ ላይ ነዎት።', // needs native review
      landmarks: 'ከላይ የግላዊነት ማስጠንቀቂያ እና ከታች የስራ ማስገቢያ ቅጽ ይገኛሉ።', // needs native review
      actions: [
        'የስራ ቦታ እና የቃለ-መጠይቅ ተደራሽነት ድጋፎችን ያስገቡ።', // needs native review
        'የህክምና ማስረጃ ሳይጠይቁ የስራ ማስታወቂያውን ያትሙ።', // needs native review
      ],
    },
    form_builder: {
      title: 'የቅጽ ገንቢ አስተዳደር', // needs native review
      locationAnnouncement:
        'እርስዎ በተገደበው የቅጽ ገንቢ አስተዳደር ገጽ ላይ ነዎት። ቅጾችን ለማየት ወይም ለማስተካከል የአስተዳዳሪ መግቢያ ያስፈልጋል።', // needs native review
      landmarks:
        'ሳይገቡ የመግቢያ ቅጽ ይታያል። ከገቡ በኋላ የቅጾች፣ የድርጅቶች፣ የገቡ መረጃዎች፣ የትንታኔ እና የመለያ ቅንብር ትሮች ይገኛሉ።', // needs native review
      actions: [
        'የድርጅት ቅጾችን ለማስተዳደር በአስተዳዳሪ መለያ ይግቡ።', // needs native review
      ],
    },
    judge: {
      title: 'የተደራሽነት ማረጋገጫ ዝርዝር', // needs native review
      locationAnnouncement: 'እርስዎ በማሳያ እና የተደራሽነት ማረጋገጫ ገጽ ላይ ነዎት።', // needs native review
      landmarks: 'የWCAG 2.2 AA መስፈርቶች እና ፈጣን መሞከሪያ አዝራሮች በዋናው ገጽ ላይ አሉ።', // needs native review
      actions: [
        'እያንዳንዱን ገጽ እና የድምፅ ረዳት አሰራር ይፈትሹ።', // needs native review
      ],
    },
  },
  om: {
    home: {
      title: 'Fuula Duraa — Karra Dhaabbataa Savanna fi ALX', // needs native review
      locationAnnouncement:
        'Isin fuula duraa Karra Mijataa Savanna fi ALX irra jirtu.', // needs native review
      landmarks:
        'Gubbaa irra qajeelfamni fuulotaa, filannoon afaanii fi Gargaaraan Sagalee jiru; gidduu irratti galmee fi hojiiwwan, jala irratti immoo waa\'ee ALX fi odeeffannoo nageenyaa argattu.', // needs native review
      actions: [
        'Waraqaa eenyummaa gandaa malee galmaa\'uuf "Galmee jalqabi" tuqaa.', // needs native review
        'Hojiiwwan mijatoo barbaaduuf "Hojiiwwan Mijatoo" banaa.', // needs native review
        'Qabduu gubbaa irraa Qabeenya Barnootaa ykn Daashboordii banaa.', // needs native review
      ],
    },
    onboarding: {
      title: 'Galmee Barataa Mijataa', // needs native review
      locationAnnouncement: 'Isin fuula Galmee Barataa sadarkaa sadarkaan guutamu irra jirtu.', // needs native review
      landmarks: 'Gubbaa irra agarsiistuun sadarkaa, gidduutti gaaffiin tokko yeroo tokkotti jira.', // needs native review
      actions: [
        'Deebii osoo hin kuusin dura bilbila waliinii ta\'uu mirkaneessaa.', // needs native review
        'Maqaa, karaa qunnamtii fi filannoo eenyummaa barreessaa ykn sagaleedhaan guutaa.', // needs native review
      ],
    },
    profile: {
      title: 'Piroofayilii Koo', // needs native review
      locationAnnouncement: 'Isin fuula Piroofayilii Koo kan odeeffannoo kuufame sirreessu irra jirtu.', // needs native review
      landmarks: 'Unki sirreeffamaa fi qabduun buufachuu ykn haquu gidduu fuulichaatti argamu.', // needs native review
      actions: [
        'Odeeffannoo keessan haaressaa ykn JSONtiin buufadhaa.', // needs native review
      ],
    },
    career: {
      title: 'Hojiiwwan Mijatoo fi Karra Hojii', // needs native review
      locationAnnouncement: 'Isin fuula Hojiiwwan Mijatoo fi Karra Hojii irra jirtu.', // needs native review
      landmarks: 'Gubbaa irra barbaacha, calaltuu sagalee fi filannoo deeggarsaa; jala irra kaardii hojii jiru.', // needs native review
      actions: [
        'Hojiiwwan fageenyaa ykn meeshaa dubbisaa qaban calalaa.', // needs native review
        'Ibsa hojii dhaggeeffadhaatii ragaa yaalaa malee iyyadhaa.', // needs native review
      ],
    },
    learning: {
      title: 'Qabeenya Barnootaa — ALX fi Leenjii Mijataa', // needs native review
      locationAnnouncement: 'Isin fuula Qabeenya Barnootaa ALX (Software Engineering, Data Science, AI) irra jirtu.', // needs native review
      landmarks: 'Filannoon barnootaa gubbaa irratti, kaardiin koorsii sagalee qabu jala irratti argama.', // needs native review
      actions: [
        'Ibsa koorsii sagaleedhaan dhaggeeffadhaa.', // needs native review
        'Gorsa itti fayyadama screen-reader ilaalaa.', // needs native review
      ],
    },
    dashboard: {
      title: 'Daashboordii Fayyadamaa', // needs native review
      locationAnnouncement: 'Isin Daashboordii keessan kan haala galmee fi qindaa\'ina mijataa agarsiisu irra jirtu.', // needs native review
      landmarks: 'Kaardiin haala galmee, qindaa\'inni ijaa fi qabduun ariifachiisaan asitti argamu.', // needs native review
      actions: [
        'Haala dukkanaa ykn dubbisa salphaa jijjiiraa.', // needs native review
        'Gara Hojiiwwan Mijatoo ykn Qabeenya Barnootaatti darbaa.', // needs native review
      ],
    },
    employer: {
      title: 'Hojjechiistotaaf', // needs native review
      locationAnnouncement: 'Isin fuula Hojjechiistotaa kan hojiiwwan hunda hammate maxxansu irra jirtu.', // needs native review
      landmarks: 'Akeekkachiisni iccitii gubbaa irratti, unki hojii jala irratti argama.', // needs native review
      actions: [
        'Haala mijataa bakka hojii fi gaaffii fi deebii ibsaa maxxansaa.', // needs native review
      ],
    },
    form_builder: {
      title: 'Bulchiinsa Ijaarsa Unkaa', // needs native review
      locationAnnouncement:
        'Isin fuula Bulchiinsa Ijaarsa Unkaa daangeffamaa irra jirtu. Unkaalee ilaaluuf ykn gulaaluuf seenumsi bulchaa ni barbaachisa.', // needs native review
      landmarks:
        'Osoo hin seenin unki seenumsaa gidduu jira. Erga seentanii booda unkaalee, dhaabbilee, galmeewwan, xiinxalaa fi qindaa\'ina herregaa argattu.', // needs native review
      actions: [
        'Unkaalee dhaabbataa bulchuuf hayyama bulchaatiin seenaa.', // needs native review
      ],
    },
    judge: {
      title: 'Tarree Mirkaneeffannaa WCAG 2.2 AA', // needs native review
      locationAnnouncement: 'Isin fuula mirkaneeffannaa qophii agarsiisaa irra jirtu.', // needs native review
      landmarks: 'Ulaagaaleen WCAG fi qabduun yaalii gidduu irratti argamu.', // needs native review
      actions: [
        'Kutaa hundaa kiiboordii fi sagaleedhaan sakatta\'aa.', // needs native review
      ],
    },
  },
};

export function getOrientationSpec(
  module: GatewayModule,
  language: SupportedLanguage
): PageOrientationSpec {
  const dict = PAGE_ORIENTATION_SPECS[language] || PAGE_ORIENTATION_SPECS.en;
  return dict[module] || dict.home;
}

export function buildFullOrientationText(
  module: GatewayModule,
  language: SupportedLanguage
): string {
  const spec = getOrientationSpec(module, language);
  const actionsLine = spec.actions.map((a, idx) => `${idx + 1}. ${a}`).join(' ');
  return `${spec.locationAnnouncement} ${spec.landmarks} ${actionsLine}`;
}

/**
 * Resolves direct spatial orientation inquiries ("Where am I", "What can I do", etc.)
 * across English, Amharic, and Afaan Oromo so learners always receive immediate, exact guidance.
 */
export function resolveOrientationIntent(
  rawQuery: string,
  module: GatewayModule,
  language: SupportedLanguage
): string | null {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return null;

  const isWhereAmI =
    /\b(where am i|which page|what page is this|current page|current location|explain this page|page layout|what is on my screen|what is on the screen|read this information|read the page|read this page)\b/i.test(
      q
    ) || /(የት\s*ነኝ|የትኛው\s*ገጽ|ይህን\s*ገጽ\s*አብራራ|ስክሪኑ\s*ላይ\s*ያለውን|eessan\s*jira|fuula\s*kami|fuula\s*kana\s*ibsi)/i.test(q);

  const isWhatCanIDo =
    /\b(what can i do|what should i do|available actions|help me navigate|how does this page work|what options)\b/i.test(
      q
    ) || /(ምን\s*ማድረግ|እንዴት\s*ልጀምር|maal\s*gochuu|filannoo\s*maal)/i.test(q);

  const isExplainButton =
    /\b(what does this button do|explain this button|what is this button)\b/i.test(q) ||
    /(ይህ\s*ቁልፍ\s*ምን\s*ይሰራል|qabduun\s*kun\s*maal\s*hojjeta)/i.test(q);

  if (isExplainButton) {
    const spec = getOrientationSpec(module, language);
    if (language === 'am') {
      return `በ"${spec.title}" ገጽ ላይ ያሉ ዋና ቁልፎች፦\n${spec.actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`;
    }
    if (language === 'om') {
      return `Qabduuwwan ijoon fuula "${spec.title}" irra jiran:\n${spec.actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`;
    }
    return `Here is what the main controls on ${spec.title} do:\n${spec.actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}\nNotice: The Voice Assistant and Wake Mic buttons let you control everything hands-free.`;
  }

  if (!isWhereAmI && !isWhatCanIDo) return null;

  const spec = getOrientationSpec(module, language);
  const numberedActions = spec.actions.map((a, idx) => `${idx + 1}. ${a}`).join('\n');

  if (language === 'am') {
    if (isWhereAmI && isWhatCanIDo) {
      return `${spec.locationAnnouncement}\n${spec.landmarks}\n\nማድረግ የሚችሉት:\n${numberedActions}\n\nማረጋገጫ፦ በገጹ አናት ላይ "${spec.title}" የሚለው ርዕስ ይታያል።`;
    }
    if (isWhereAmI) {
      return `${spec.locationAnnouncement}\n${spec.landmarks}\n\nማረጋገጫ፦ አሁን ያሉበት ክፍል "${spec.title}" ነው።`;
    }
    return `በ"${spec.title}" ገጽ ላይ ማድረግ የሚችሉት:\n${numberedActions}\n\nማረጋገጫ፦ እያንዳንዱ አዝራር በTab ቁልፍ እና በEnter ይሰራል።`;
  }

  if (language === 'om') {
    if (isWhereAmI && isWhatCanIDo) {
      return `${spec.locationAnnouncement}\n${spec.landmarks}\n\nWaan gochuu dandeessan:\n${numberedActions}\n\nMirkaneessaa: Matadureen "${spec.title}" gubbaa fuulichaarratti argama.`;
    }
    if (isWhereAmI) {
      return `${spec.locationAnnouncement}\n${spec.landmarks}\n\nMirkaneessaa: Amma "${spec.title}" irra jirtu.`;
    }
    return `Fuula "${spec.title}" irratti waan gochuu dandeessan:\n${numberedActions}\n\nMirkaneessaa: Qabduun hundi kiiboordii Tab fi Enter tiin ni hojjetu.`;
  }

  if (isWhereAmI && isWhatCanIDo) {
    return `${spec.locationAnnouncement}\n${spec.landmarks}\n\nWhat you can do here:\n${numberedActions}\n\nConfirmation: Look for the main heading "${spec.title}" at the top of the workspace.`;
  }
  if (isWhereAmI) {
    return `${spec.locationAnnouncement}\n${spec.landmarks}\n\nConfirmation: Your active navigation tab is set to "${spec.title}".`;
  }
  return `Available actions on ${spec.title}:\n${numberedActions}\n\nConfirmation: Every control can be reached by Tab and activated with Enter or Space.`;
}
