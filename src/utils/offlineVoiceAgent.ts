import {
  AccommodationCategory,
  GatewayModule,
  IdentityRoute,
  SupportedLanguage,
  SupportPreference,
} from '../types/gateway';
import type { ToolCallExecutionResult } from '../context/WebsiteAgentContext';
import { getOrientationSpec, resolveOrientationIntent } from './pageOrientation';

export interface OfflineAgentSessionState {
  pendingAction:
    | 'delete_profile'
    | 'submit_registration'
    | 'submit_job_application'
    | 'update_profile'
    | null;
  pendingArgs?: Record<string, unknown>;
  lastJobQuery?: string;
  lastJobCategories?: AccommodationCategory[];
  lastJobsList?: Array<{ id: string; title: string; organization: string; isRemote?: boolean; requiredSkills?: string[] }>;
  referencedJobId?: string;
  lastLearningCategory?: 'all' | 'se' | 'data' | 'ai' | 'a11y';
  lastTracksList?: Array<{ id: string; title: string; duration: string; summary: string; assistiveNotes: string[]; outcomes: string[] }>;
  referencedTrackId?: string;
}

export function createOfflineAgentSessionState(): OfflineAgentSessionState {
  return { pendingAction: null };
}

function localized(lang: SupportedLanguage, en: string, am: string, om: string): string {
  if (lang === 'am') return am;
  if (lang === 'om') return om;
  return en;
}

function isAffirmative(text: string): boolean {
  return /^(yes|yeah|yep|yup|ok|okay|confirm|confirmed|sure|go ahead|do it|submit|please submit|send it|save it|አዎ|እሺ|አረጋግጥ|ላክ|አስገባ|eeyyee|tole|ergi|galchi|mirkaneessi)\b/i.test(
    text.trim()
  ) || /\b(yes submit|yes delete|yes confirm|confirm submit|submit it|go ahead and submit|አዎ ላክ|አዎ ሰርዝ|eeyyee ergi|eeyyee haqi)\b/i.test(text);
}

function isNegative(text: string): boolean {
  return /^(no|nope|nah|stop|don't|do not|never mind|keep|አይ|አልፈልግም|ተወው|lakkii|hin barbaadu|dhiisi)\b/i.test(
    text.trim()
  );
}

function formatRegistrationPrompt(stepId: string, lang: SupportedLanguage): string {
  switch (stepId) {
    case 'device-privacy':
      return localized(
        lang,
        'Question 1 of 6 (optional): Are you using a shared phone or public computer right now? Say "yes, shared device" or "no, my own device".',
        'ጥያቄ 1 ከ6 (አማራጭ)፦ አሁን የጋራ ስልክ ወይም የህዝብ ኮምፒውተር እየተጠቀሙ ነው? "አዎ የጋራ ነው" ወይም "አይ የራሴ ነው" ይበሉ።',
        'Gaaffii 1ffaa (filannoo): Amma bilbila waliinii ykn kompiitara uummataa fayyadamaa jirtuu? "Eeyyee kan waliiniiti" ykn "Lakkii kan kooti" jedhaa.'
      );
    case 'full-name':
      return localized(
        lang,
        'Question 2 of 6: What is your full name? You can say your name now, or ask me to explain why we ask.',
        'ጥያቄ 2 ከ6፦ ሙሉ ስምዎ ማን ነው? ስምዎን አሁን መናገር ይችላሉ።',
        'Gaaffii 2ffaa: Maqaan keessan guutuun eenyu? Amma maqaa keessan dubbachuu dandeessu.'
      );
    case 'contact':
      return localized(
        lang,
        'Question 3 of 6 (optional): How can we contact you? Tell me an Ethiopian phone number like 0911223344, an email address, or say "skip".',
        'ጥያቄ 3 ከ6 (አማራጭ)፦ እንዴት ልናገኝዎ እንችላለን? የኢትዮጵያ ስልክ ቁጥር (ለምሳሌ 0911223344)፣ ኢሜይል ይንገሩኝ ወይም "ዝለል" ይበሉ።',
        'Gaaffii 3ffaa (filannoo): Akkamitti isin qunnamna? Lakkoofsa bilbilaa (fkn 0911223344), imeelii himaa ykn "irra darbi" jedhaa.'
      );
    case 'identity-route':
      return localized(
        lang,
        'Question 4 of 6: Choose an identity option. Say "National ID", "Refugee ID", "Other document", "Partner referral", or "I do not have documents". Kebele ID is not required.',
        'ጥያቄ 4 ከ6፦ የመታወቂያ አማራጭ ይምረጡ። "ብሔራዊ መታወቂያ"፣ "የስደተኛ መታወቂያ"፣ "ሌላ ሰነድ"፣ "በአጋር ድርጅት" ወይም "ሰነድ የለኝም" ይበሉ።',
        'Gaaffii 4ffaa: Filannoo eenyummaa filadhaa. "Waraqaa eenyummaa biyyaalessaa", "Waraqaa baqataa", "Sanada biraa", "Karaa dhaabbata michuu" ykn "Sanada hin qabu" jedhaa.'
      );
    case 'private-support':
      return localized(
        lang,
        'Question 5 of 6 (optional): Would you like any learning or accessibility support, such as screen reader materials, large text, sign language, or flexible scheduling? This stays private. Tell me what helps or say "skip".',
        'ጥያቄ 5 ከ6 (አማራጭ)፦ የመማሪያ ወይም የተደራሽነት ድጋፍ ይፈልጋሉ? (ለምሳሌ ስክሪን ሪደር፣ ትልቅ ጽሑፍ፣ የምልክት ቋንቋ ወይም ተለዋዋጭ ሰዓት)። ይህ በሚስጥር ይያዛል። የሚፈልጉትን ይናገሩ ወይም "ዝለል" ይበሉ።',
        'Gaaffii 5ffaa (filannoo): Deeggarsa barnootaa ykn mijatinaa (fkn screen reader, barreeffama guddaa, afaan mallattoo) barbaadduu? Kun iccitiin qabama. Waan barbaaddan himaa ykn "irra darbi" jedhaa.'
      );
    case 'partner-consent':
      return localized(
        lang,
        'Question 6: Since a partner is assisting, please tell me the partner organization name, representative name, and confirm consent to submit.',
        'ጥያቄ 6፦ አጋር እየረዳዎት ስለሆነ የድርጅቱን ስም፣ የወኪሉን ስም እና ለመላክ ፈቃድዎን ያረጋግጡ።',
        'Gaaffii 6ffaa: Dhaabbanni michuu waan isin gargaaruuf maqaa dhaabbataa, maqaa bakka bu\'aa fi hayyama keessan mirkaneessaa.'
      );
    default:
      return localized(
        lang,
        'Please review your answers or say "submit" to finish.',
        'መልሶችዎን ይገምግሙ ወይም ለመጨረስ "ላክ" ይበሉ።',
        'Deebii keessan ilaalaa ykn xumuruuf "ergi" jedhaa.'
      );
  }
}

function formatRegistrationExplanation(stepId: string, lang: SupportedLanguage): string {
  switch (stepId) {
    case 'device-privacy':
      return localized(
        lang,
        'We ask if this is a shared device so we never leave your personal details saved on a public phone or computer. This step is optional.',
        'ይህን የምንጠይቀው በጋራ ስልክ ወይም ኮምፒውተር ላይ የግል መረጃዎ እንዳይቀመጥ ለመጠበቅ ነው። ይህ ደረጃ አማራጭ ነው።',
        'Bilbila waliinii irratti odeeffannoon keessan akka hin hafne eeguuf gaafanna. Kun filannoo dha.'
      );
    case 'full-name':
      return localized(
        lang,
        'We only need the name you want trainers and programs to use when greeting you and preparing your learner profile.',
        'ስምዎን የምንጠይቀው አሰልጣኞች እና ፕሮግራሞች እርስዎን በትክክል እንዲጠሩዎት ብቻ ነው።',
        'Leenjiftoonni fi sagantaaleen maqaa keessaniin akka isin waamaniif qofa barbaanna.'
      );
    case 'contact':
      return localized(
        lang,
        'Contact details are optional. They let coordinators follow up with your learning schedule. You can share an Ethiopian phone number, email, partner desk, or skip.',
        'የመገናኛ መረጃ አማራጭ ነው። አስተባባሪዎች የትምህርት መርሃ ግብርዎን እንዲያሳውቁዎት ይረዳል። ከፈለጉ "ዝለል" ማለት ይችላሉ።',
        'Odeeffannoon qunnamtii filannoo dha. Qindeessitoonni sagantaa barnootaa isinitti himuuf gargaara. Yoo barbaaddan "irra darbi" jechuu dandeessu.'
      );
    case 'identity-route':
      return localized(
        lang,
        'A Kebele ID or passport is never mandatory. We accept National ID, Refugee ID, student/community letters, partner referrals, or continuing without documents.',
        'የቀበሌ መታወቂያ ወይም ፓስፖርት በፍጹም አስገዳጅ አይደለም። ብሔራዊ መታወቂያ፣ የስደተኛ መታወቂያ፣ የአጋር ድርጅት ዋስትና ወይም ያለ ሰነድ መቀጠል ይችላሉ።',
        'Waraqaan eenyummaa gandaa ykn paaspoortiin dirqama miti. Waraqaa eenyummaa biyyaalessaa, baqataa, wabii dhaabbata michuu ykn sanada malee itti fufuu dandeessu.'
      );
    case 'private-support':
      return localized(
        lang,
        'This optional step lets accessibility coordinators prepare screen-reader files, large print, extra time, or sign-language support. It is never shared with employers or medical diagnoses asked.',
        'ይህ አማራጭ ደረጃ የተደራሽነት አስተባባሪዎች የድምፅ፣ የስክሪን ሪደር ወይም የምልክት ቋንቋ ድጋፍ እንዲያዘጋጁ ይረዳል። ለቀጣሪዎች በጭራሽ አይጋራም።',
        'Sadarkaan filannoo kun qindeessitoonni meeshaalee screen reader, barreeffama guddaa ykn afaan mallattoo akka qopheessan gargaara. Hojjechiistotaaf gonkumaa hin qoodamu.'
      );
    default:
      return localized(
        lang,
        'All optional steps can be skipped, and you can edit any answer before confirming submission.',
        'ማንኛውንም አማራጭ ጥያቄ መዝለል እና ከመላክዎ በፊት መልሶችዎን ማስተካከል ይችላሉ።',
        'Gaaffii filannoo kamiyyuu irra darbuu fi erguun dura deebii kamiyyuu sirreessuu dandeessu.'
      );
  }
}

function formatRegistrationReviewSummary(
  summary: Record<string, unknown>,
  lang: SupportedLanguage
): string {
  const name = String(summary.fullName || 'Not provided');
  const contactMethod = String(summary.contactMethod || 'none');
  const contactValue = String(summary.contactValue || 'Not shared');
  const idRoute = String(summary.identityRoute || 'Not chosen');
  const supportCount = Number(summary.supportPreferencesCount || 0);
  return localized(
    lang,
    `Here is your registration summary: Name is ${name}. Contact is ${contactMethod} (${contactValue}). Identity option is ${idRoute}. Private support items selected: ${supportCount}. Would you like me to submit this registration now? Say "yes, submit" or tell me what to change.`,
    `የምዝገባ ማጠቃለያዎ ይህ ነው፦ ስም ${name}፣ መገናኛ ${contactMethod} (${contactValue})፣ የመታወቂያ አማራጭ ${idRoute}፣ የግል ድጋፍ ምርጫዎች ${supportCount}። አሁን ልላከው? "አዎ ላክ" ይበሉ ወይም የሚቀየር ካለ ይንገሩኝ።`,
    `Cuunfaan galmee keessanii kana: Maqaa ${name}, Qunnamtii ${contactMethod} (${contactValue}), Filannoo eenyummaa ${idRoute}, Deeggarsa dhuunfaa ${supportCount}. Amma galmee kana erguu? "Eeyyee ergi" jedhaa ykn waan jijjiiramu himaa.`
  );
}

function extractCategoriesFromText(lower: string): AccommodationCategory[] {
  const cats: AccommodationCategory[] = [];
  if (/(remote|work from home|wfh|telework|የርቀት|ቤት|fagoo|mana irraa)/i.test(lower)) {
    cats.push('remote_flexible');
  }
  if (/(flexible|part time|extra time|ተለዋዋጭ|yeroo mijataa)/i.test(lower)) {
    cats.push('flexible_hours');
  }
  if (/(screen reader|nvda|jaws|voiceover|blind|visual|ስክሪን ሪደር|ዓይነ ስውር|agartuu|dubbisa iskiriinii)/i.test(lower)) {
    cats.push('screen_reader_tools');
  }
  if (/(sign language|interpreter|deaf|caption|written interview|ምልክት|አስተርጓሚ|mallattoo)/i.test(lower)) {
    cats.push('communication_support');
  }
  if (/(assistive|software|braille|magnifier|አጋዥ ቴክኖሎጂ|teeknooloojii)/i.test(lower)) {
    cats.push('assistive_tech');
  }
  if (/(wheelchair|step-free|elevator|ramp|physical|accessible workplace|ተደራሽ የስራ ቦታ|bakka hojii mijataa)/i.test(lower)) {
    cats.push('accessible_workplace');
  }
  return Array.from(new Set(cats));
}

function extractJobKeywordQuery(raw: string): string {
  const stop = new Set([
    'find', 'search', 'look', 'for', 'show', 'me', 'accessible', 'jobs', 'job', 'work',
    'roles', 'openings', 'with', 'in', 'please', 'any', 'are', 'there', 'filter', 'remote',
    'screen', 'reader', 'only', 'ones', 'suitable', 'beginners', 'beginner', 'entry',
    'ስራ', 'ስራዎች', 'ፈልግ', 'አሳይ', 'hojii', 'hojiiwwan', 'barbaadi', 'naaf',
  ]);
  const tokens = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s+-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w));
  return tokens.slice(0, 3).join(' ');
}

function extractJobIdentifier(lower: string, session?: OfflineAgentSessionState): string {
  if (/(first|1st|\b1\b|one|መጀመሪያ|jalqabaa|tokkoffaa)/i.test(lower) && !/\bthat one\b/i.test(lower)) return '1';
  if (/(second|2nd|\b2\b|two|ሁለተኛ|lammaffaa)/i.test(lower)) return '2';
  if (/(third|3rd|\b3\b|three|ሦስተኛ|sadaffaa)/i.test(lower)) return '3';
  if (/\b(it|this job|that job|this role|that role|this one|that one|same)\b/i.test(lower) || /(ለዚህ ስራ|ለዚህ|kanaaf)/i.test(lower)) {
    return session?.referencedJobId || '1';
  }
  const cleaned = lower
    .replace(/(apply for|apply to|details about|details for|tell me about|explain|read|requirements|open|the|job|role|position|this|that|it)/gi, '')
    .trim();
  return cleaned || session?.referencedJobId || '1';
}

export async function runOfflineVoiceAgent(
  userText: string,
  lang: SupportedLanguage,
  stateSnapshot: Record<string, unknown>,
  executeTool: (name: string, args?: Record<string, unknown>) => Promise<ToolCallExecutionResult>,
  session: OfflineAgentSessionState
): Promise<{ replyText: string; language: SupportedLanguage }> {
  const trimmed = userText.trim();
  const lower = trimmed.toLowerCase();

  // 1. Pending confirmation gate handling (irreversible / submission actions)
  if (session.pendingAction) {
    if (isAffirmative(trimmed)) {
      const action = session.pendingAction;
      const args = session.pendingArgs || {};
      session.pendingAction = null;
      session.pendingArgs = undefined;

      if (action === 'delete_profile') {
        const res = await executeTool('delete_user_profile', { confirmed: true });
        if (res.ok) {
          return {
            language: lang,
            replyText: localized(
              lang,
              'Done. Your saved profile and local drafts have been permanently deleted.',
              'ተጠናቋል። የተቀመጠው መገለጫዎ እና የአካባቢ ረቂቅዎ በቋሚነት ተሰርዘዋል።',
              'Xumurameera. Eenyummaan keessanii fi qophiin kuufame dhaabbataan haqamaniiru.'
            ),
          };
        }
        return { language: lang, replyText: String(res.data.error || 'Could not delete profile.') };
      }

      if (action === 'update_profile') {
        const res = await executeTool('update_user_profile', { ...args, confirmed: true });
        if (res.ok) {
          return {
            language: lang,
            replyText: localized(
              lang,
              'Confirmed. Your profile changes have been saved.',
              'ተረጋግጧል። የመገለጫ ለውጦችዎ ተቀምጠዋል።',
              'Mirkanaa\'eera. Jijjiiramni eenyummaa keessanii kuufameera.'
            ),
          };
        }
        return { language: lang, replyText: String(res.data.error || 'Could not update profile.') };
      }

      if (action === 'submit_registration') {
        const res = await executeTool('submit_registration', { confirmed: true });
        if (res.ok) {
          const receipt = res.data.receipt as { id?: string } | undefined;
          return {
            language: lang,
            replyText: localized(
              lang,
              `Confirmed! Your registration is submitted with reference ID ${receipt?.id || 'SAV'}. You can now explore accessible jobs or check your dashboard.`,
              `ተረጋግጧል! ምዝገባዎ በማጣቀሻ ቁጥር ${receipt?.id || 'SAV'} ተልኳል። አሁን ተደራሽ ስራዎችን ማየት ይችላሉ።`,
              `Mirkanaa'eera! Galmeen keessan lakkoofsa wabii ${receipt?.id || 'SAV'} tiin ergameera. Amma hojiiwwan mijatoo sakatta'uu dandeessu.`
            ),
          };
        }
        return {
          language: lang,
          replyText: String(
            res.data.error ||
              (Array.isArray(res.data.validationErrors)
                ? (res.data.validationErrors as Array<{ message: string }>).map((e) => e.message).join(' ')
                : 'Could not submit registration yet.')
          ),
        };
      }

      if (action === 'submit_job_application') {
        const res = await executeTool('submit_job_application', { confirmed: true });
        if (res.ok) {
          const receipt = res.data.receipt as { id?: string } | undefined;
          return {
            language: lang,
            replyText: localized(
              lang,
              `Confirmed! Your application for ${String(res.data.jobTitle || 'the role')} has been submitted. Reference ID: ${receipt?.id || 'APP'}.`,
              `ተረጋግጧል! ለ${String(res.data.jobTitle || 'ስራው')} ያቀረቡት ማመልከቻ ተልኳል። የማጣቀሻ ቁጥር፦ ${receipt?.id || 'APP'}።`,
              `Mirkanaa'eera! Iyyannoon keessan hojii ${String(res.data.jobTitle || '')} tiif ergameera. Lakkoofsa wabii: ${receipt?.id || 'APP'}.`
            ),
          };
        }
        return { language: lang, replyText: String(res.data.error || 'Could not submit application yet.') };
      }
    } else if (isNegative(trimmed) || /\b(cancel|stop|keep)\b/i.test(lower)) {
      session.pendingAction = null;
      session.pendingArgs = undefined;
      return {
        language: lang,
        replyText: localized(
          lang,
          'Okay, I cancelled that action. Nothing was submitted or deleted.',
          'እሺ፣ ያንን እርምጃ ሰርዤዋለሁ። ምንም ነገር አልተላከም ወይም አልተሰረዘም።',
          'Tole, tarkaanfii sana haqeera. Wanti tokko illee hin ergamne ykn hin haqamne.'
        ),
      };
    }
  }

  const activeModule = String(stateSnapshot.activeModule || 'home') as GatewayModule;
  const onboardingState = stateSnapshot.onboarding as {
    currentStepId?: string;
    isReviewStep?: boolean;
    filledSummary?: Record<string, unknown>;
  } | undefined;
  const careerState = stateSnapshot.career as {
    activeApplication?: {
      jobId: string;
      jobTitle: string;
      stepIndex: number;
      isReviewStep: boolean;
      draft: Record<string, unknown>;
    } | null;
  } | undefined;

  // 2. Spatial Orientation Queries
  const orientation = resolveOrientationIntent(trimmed, activeModule, lang);
  if (orientation) {
    return { language: lang, replyText: orientation };
  }

  // 3. Accessibility Settings (Dark/Light, Easy Read, Language, Orientation Speech)
  if (/\b(dark mode|dark theme|turn on dark)\b/i.test(lower) || /(ጨለማ|dukkana)/i.test(lower)) {
    await executeTool('update_accessibility_settings', { colorMode: 'dark' });
    return {
      language: lang,
      replyText: localized(
        lang,
        'Confirmed: Dark mode is now turned on across the website.',
        'ተረጋግጧል፦ የጨለማ ሁነታ (Dark mode) በመላው ድረ-ገጹ ላይ በርቷል።',
        'Mirkanaa\'eera: Haalli dukkanaa (Dark mode) weebsaayitii guutuu irratti banameera.'
      ),
    };
  }
  if (/\b(light mode|light theme|turn off dark)\b/i.test(lower) || /(ብርሃን|ifa)/i.test(lower)) {
    await executeTool('update_accessibility_settings', { colorMode: 'light' });
    return {
      language: lang,
      replyText: localized(
        lang,
        'Confirmed: Light mode is now active.',
        'ተረጋግጧል፦ የብርሃን ሁነታ (Light mode) አሁን ነቅቷል።',
        'Mirkanaa\'eera: Haalli ifaa (Light mode) amma hojjetaa jira.'
      ),
    };
  }
  if (/\b(easy read|simple view|plain view)\b/i.test(lower) || /(ቀላል እይታ|dubbisa salphaa)/i.test(lower)) {
    const turnOff = /\b(off|disable|normal)\b/i.test(lower);
    await executeTool('update_accessibility_settings', { easyRead: !turnOff });
    return {
      language: lang,
      replyText: localized(
        lang,
        turnOff ? 'Confirmed: Simple view is now turned off.' : 'Confirmed: Simple view (Easy Read) is now turned on with larger spacing.',
        turnOff ? 'ተረጋግጧል፦ ቀላል እይታ ጠፍቷል።' : 'ተረጋግጧል፦ ቀላል እይታ (Easy Read) በሰፊ ክፍተት በርቷል።',
        turnOff ? 'Mirkanaa\'eera: Mul\'anni salphaan dhaameera.' : 'Mirkanaa\'eera: Mul\'anni salphaan (Easy Read) banameera.'
      ),
    };
  }
  if (
    /\b(switch|change|use|speak)\b.*\b(amharic|oromo|oromiffa|english)\b/i.test(lower) ||
    /(ወደ አማርኛ|በአማርኛ|ወደ እንግሊዝኛ|afaan oromootiin|afaan ingilizii)/i.test(lower)
  ) {
    const target: SupportedLanguage = /(amharic|አማርኛ|amaariffa)/i.test(lower)
      ? 'am'
      : /(oromo|oromiffa|ኦሮምኛ|oromoo)/i.test(lower)
      ? 'om'
      : 'en';
    await executeTool('update_accessibility_settings', { language: target });
    return {
      language: target,
      replyText: localized(
        target,
        'Confirmed: Language is now switched to English.',
        'ተረጋግጧል፦ ቋንቋው አሁን ወደ አማርኛ ተቀይሯል።',
        'Mirkanaa\'eera: Afaan amma gara Afaan Oromootti jijjiirameera.'
      ),
    };
  }

  // 4. Sign-in / Resume Profile & Profile read / update / delete commands
  if (
    /\b(log\s*in|login|sign\s*in|resume my profile|resume saved)\b/i.test(lower) ||
    /(መግባት|ግባ|seenuu|galuu)/i.test(lower)
  ) {
    const res = await executeTool('get_user_profile', { openProfilePage: true });
    if (res.data.hasSavedProfile) {
      const p = res.data.profile as { fullName?: string; contactMethod?: string; contactValue?: string };
      return {
        language: lang,
        replyText: localized(
          lang,
          `Welcome back, ${p.fullName}. This platform does not use a password login—your saved learner profile is loaded in My Profile (${p.contactMethod || 'contact'} ${p.contactValue || ''}). Ask to update your phone number, update skills, or browse accessible jobs.`,
          `እንኳን ደህና መጡ ${p.fullName}። ይህ መድረክ በይለፍ ቃል መግባት አይጠይቅም—የተቀመጠው መገለጫዎ በ"መገለጫዬ" ውስጥ ተከፍቷል።`,
          `Baga nagaan dhuftan ${p.fullName}. Piroofayiliin keessan kuufame "Piroofayilii koo" keessatti banameera.`
        ),
      };
    }
    return {
      language: lang,
      replyText: localized(
        lang,
        'This platform does not use a password login—we keep your profile private on this device or via partner referral. No saved profile was found here yet. Say "start registration" to create your learner profile now, or use Save & Resume on the registration page.',
        'ይህ መድረክ የይለፍ ቃል መግቢያ አይጠቀምም። የተቀመጠ መገለጫ ገና አልተገኘም። አዲስ መገለጫ ለመፍጠር "ምዝገባ ጀምር" ይበሉ።',
        'Weebsaayitiin kun password hin gaafatu. Piroofayiliin kuufame amma hin argamne. Galmaa\'uuf "galmee jalqabi" jedhaa.'
      ),
    };
  }

  if (/\b(delete|remove|erase)\b.*\b(profile|account|my data)\b/i.test(lower) || /(መገለጫ.*ሰርዝ|eenyummaa.*haqi)/i.test(lower)) {
    session.pendingAction = 'delete_profile';
    return {
      language: lang,
      replyText: localized(
        lang,
        'Warning: deleting your saved profile and drafts is permanent and cannot be undone. Are you sure you want me to delete your profile? Say "yes, delete" to confirm or "no" to keep it.',
        'ማስጠንቀቂያ፦ የተቀመጠውን መገለጫዎን መሰረዝ ቋሚ ነው። መሰረዝ እንደሚፈልጉ እርግጠኛ ነዎት? ለማረጋገጥ "አዎ ሰርዝ" ወይም "አይ" ይበሉ።',
        'Akeekkachiisa: Eenyummaa keessan haquun dhaabbataa dha. Haquu barbaadduu? Mirkaneessuuf "Eeyyee haqi" ykn "Lakkii" jedhaa.'
      ),
    };
  }

  if (/\b(my profile|check profile|show profile|view profile|read my profile)\b/i.test(lower) || /(መገለጫዬን አሳይ|eenyummaa koo agarsiisi)/i.test(lower)) {
    const res = await executeTool('get_user_profile', { openProfilePage: true });
    if (!res.data.hasSavedProfile) {
      return {
        language: lang,
        replyText: localized(
          lang,
          'You do not have a saved profile yet. Would you like me to start registration for you?',
          'እስካሁን የተቀመጠ መገለጫ የለዎትም። ምዝገባውን እንድጀምርልዎ ይፈልጋሉ?',
          'Ammatti eenyummaa kuufame hin qabdan. Galmee isiniif jalqabuu?'
        ),
      };
    }
    const p = res.data.profile as {
      fullName?: string;
      contactMethod?: string;
      contactValue?: string;
      identityRoute?: string;
      supportNotes?: string;
    };
    return {
      language: lang,
      replyText: localized(
        lang,
        `I opened My Profile. Your saved name is ${p.fullName}, contact is ${p.contactMethod} ${p.contactValue || ''}, and identity option is ${p.identityRoute}.${p.supportNotes ? ` Notes: ${p.supportNotes}.` : ''} You can ask me to change your name, phone number, or skills, or delete your profile.`,
        `መገለጫዬን ከፍቻለሁ። የተቀመጠው ስምዎ ${p.fullName}፣ መገናኛ ${p.contactMethod} ${p.contactValue || ''} እና የመታወቂያ አማራጭ ${p.identityRoute} ነው። ማንኛውንም መረጃ እንድቀይር መጠየቅ ይችላሉ።`,
        `Eenyummaa koo baneera. Maqaan keessan ${p.fullName}, qunnamtiin ${p.contactMethod} ${p.contactValue || ''}, filannoon eenyummaa ${p.identityRoute} dha.`
      ),
    };
  }

  // Direct field correction during registration or profile (name, phone number, skills)
  const changeNameMatch = trimmed.match(/(?:change|update|edit|set|correct)\s+(?:my\s+)?(?:full\s+)?name\s+(?:to|is)\s+(.+)/i)
    || trimmed.match(/(?:ስሜን|ስሜ)\s+(.+?)\s*(?:ብለህ\s*)?(?:ቀይር|አድርግ)/i)
    || trimmed.match(/(?:maqaa\s+koo)\s+(?:gara\s+)?(.+?)(?:\s+tti\s+jijjiiri|\s+jijjiiri)/i);
  if (changeNameMatch?.[1]) {
    const newName = changeNameMatch[1].trim().replace(/[.!?]+$/, '');
    if (activeModule === 'onboarding' || activeModule === 'profile') {
      await executeTool('update_registration_answer', {
        fullName: newName,
        preserveCurrentStep: true,
      });
      const status = await executeTool('get_registration_status');
      return {
        language: lang,
        replyText: localized(
          lang,
          `Updated your full name to ${newName}. ${status.data.isReviewStep ? formatRegistrationReviewSummary(status.data.summary as Record<string, unknown>, lang) : formatRegistrationPrompt(String((status.data.currentStep as { id?: string })?.id || ''), lang)}`,
          `ሙሉ ስምዎን ወደ ${newName} አስተካክያለሁ።`,
          `Maqaa keessan guutuu gara ${newName} tti sirreesseera.`
        ),
      };
    } else if (stateSnapshot.savedLearnerProfile) {
      session.pendingAction = 'update_profile';
      session.pendingArgs = { fullName: newName };
      return {
        language: lang,
        replyText: localized(
          lang,
          `I can update your saved profile name to ${newName}. Say "yes" to confirm saving this change.`,
          `የተቀመጠውን የመገለጫ ስምዎን ወደ ${newName} ማስተካከል እችላለሁ። ለማረጋገጥ "አዎ" ይበሉ።`,
          `Maqaa eenyummaa keessanii gara ${newName} tti jijjiiruu nan danda'a. Mirkaneessuuf "Eeyyee" jedhaa.`
        ),
      };
    }
  }

  const changePhoneMatch =
    trimmed.match(/(?:change|update|edit|set)\s+(?:my\s+)?(?:phone|phone number|contact|number)\s+(?:to|is)\s+(.+)/i) ||
    trimmed.match(/(?:ስልክ\s*ቁጥሬን)\s+(.+?)\s*(?:ቀይር|አድርግ)/i) ||
    trimmed.match(/(?:lakkoofsa\s+bilbilaa)\s+(?:gara\s+)?(.+?)(?:\s+tti\s+jijjiiri|\s+jijjiiri)/i);
  if (changePhoneMatch?.[1] || /\b(change|update)\s+(my\s+)?phone number\b/i.test(lower)) {
    const newPhone = changePhoneMatch?.[1]?.trim().replace(/[.!?]+$/, '');
    if (!newPhone) {
      return {
        language: lang,
        replyText: localized(
          lang,
          'What is your new Ethiopian phone number? Please say a number starting with 09, 07, or +251.',
          'አዲሱ የኢትዮጵያ ስልክ ቁጥርዎ ስንት ነው? በ09፣ 07 ወይም +251 የሚጀምር ቁጥር ይናገሩ።',
          'Lakkoofsi bilbilaa keessan haaraan maali? 09, 07 ykn +251n kan jalqabu dubbadhaa.'
        ),
      };
    }
    if (activeModule === 'onboarding' || activeModule === 'profile') {
      const res = await executeTool('update_registration_answer', {
        contactMethod: 'phone',
        contactValue: newPhone,
        preserveCurrentStep: true,
      });
      if (!res.ok) {
        return { language: lang, replyText: String(res.data.validationError || 'Please provide a valid Ethiopian phone number starting with 09, 07, or +251.') };
      }
      return {
        language: lang,
        replyText: localized(
          lang,
          `Updated your phone number to ${newPhone}.`,
          `ስልክ ቁጥርዎን ወደ ${newPhone} አስተካክያለሁ።`,
          `Lakkoofsa bilbilaa keessan gara ${newPhone} tti sirreesseera.`
        ),
      };
    }
    if (stateSnapshot.savedLearnerProfile) {
      session.pendingAction = 'update_profile';
      session.pendingArgs = { contactMethod: 'phone', contactValue: newPhone };
      return {
        language: lang,
        replyText: localized(
          lang,
          `I can update your saved phone number to ${newPhone}. Say "yes" to confirm saving this change.`,
          `ስልክ ቁጥርዎን ወደ ${newPhone} ማስተካከል እችላለሁ። ለማረጋገጥ "አዎ" ይበሉ።`,
          `Lakkoofsa bilbilaa keessan gara ${newPhone} tti jijjiiruu nan danda'a. Mirkaneessuuf "Eeyyee" jedhaa.`
        ),
      };
    }
  }

  // Context switch while in registration ("Now my phone number", "Now my email", "Now my name")
  if (
    /\b(now\s+(?:my\s+)?phone(?:\s+number)?|enter\s+(?:my\s+)?phone(?:\s+number)?|add\s+(?:my\s+)?phone(?:\s+number)?)\b/i.test(lower) ||
    /(አሁን\s*ስልክ|ስልክ\s*ቁጥሬን\s*ላስገባ|amma\s+lakkoofsa\s+bilbilaa)/i.test(lower)
  ) {
    if (activeModule !== 'onboarding' && activeModule !== 'profile') {
      await executeTool('start_registration', { mode: 'self' });
    }
    await executeTool('update_registration_answer', { contactMethod: 'phone' });
    return {
      language: lang,
      replyText: localized(
        lang,
        'Switched to phone number on your registration form. Please tell me your Ethiopian phone number starting with 09, 07, or +251.',
        'በምዝገባ ቅጹ ላይ የስልክ ቁጥር ቦታውን ከፍቻለሁ። በ09፣ 07 ወይም +251 የሚጀምር ስልክ ቁጥርዎን ይናገሩ።',
        'Unka galmee irratti bakka lakkoofsa bilbilaa baneera. Lakkoofsa bilbilaa keessan 09, 07 ykn +251n jalqabu dubbadhaa.'
      ),
    };
  }

  if (
    /\b(now\s+(?:my\s+)?email|enter\s+(?:my\s+)?email|add\s+(?:my\s+)?email)\b/i.test(lower) ||
    /(አሁን\s*ኢሜይል|ኢሜይሌን\s*ላስገባ|amma\s+imeelii)/i.test(lower)
  ) {
    if (activeModule !== 'onboarding' && activeModule !== 'profile') {
      await executeTool('start_registration', { mode: 'self' });
    }
    await executeTool('update_registration_answer', { contactMethod: 'email' });
    return {
      language: lang,
      replyText: localized(
        lang,
        'Switched to email address on your registration form. Please say or type your email address.',
        'በምዝገባ ቅጹ ላይ የኢሜይል ቦታውን ከፍቻለሁ። ኢሜይልዎን ይናገሩ ወይም ይጻፉ።',
        'Unka galmee irratti bakka imeelii baneera. Imeelii keessan dubbadhaa ykn barreessaa.'
      ),
    };
  }

  // Direct email utterance ("My email is example@gmail.com") anywhere in onboarding or from any page
  const directEmailMatch =
    trimmed.match(/(?:my\s+email(?:\s+address)?\s+is|email\s+is|email:|ኢሜይሌ)\s*([^\s,;]+@[^\s,;]+)/i) ||
    (trimmed.includes('@') && !(activeModule === 'onboarding' && onboardingState?.currentStepId === 'contact')
      ? trimmed.match(/([^\s,;]+@[^\s,;]+)/i)
      : null);
  if (directEmailMatch?.[1]) {
    const emailVal = directEmailMatch[1].trim().replace(/[.!?]+$/, '');
    if (activeModule === 'career' && careerState?.activeApplication) {
      await executeTool('update_job_application_answer', { contactValue: emailVal });
      return {
        language: lang,
        replyText: localized(
          lang,
          `Entered your email ${emailVal} on the job application form.`,
          `ኢሜይልዎን ${emailVal} በስራ ማመልከቻው ላይ አስገብቻለሁ።`,
          `Imeelii keessan ${emailVal} iyyannoo hojii irratti galcheera.`
        ),
      };
    }
    await executeTool('update_registration_answer', {
      contactMethod: 'email',
      contactValue: emailVal,
    });
    return {
      language: lang,
      replyText: localized(
        lang,
        `Entered your email as ${emailVal} on the registration form. Say "continue" for identity options, or say "now my phone number" to switch.`,
        `ኢሜይልዎን ${emailVal} በምዝገባ ቅጹ ላይ አስገብቻለሁ።`,
        `Imeelii keessan ${emailVal} unka galmee irratti galcheera.`
      ),
    };
  }

  // Direct phone utterance ("My phone number is 0912345678") outside contact-only reply
  const directPhoneMatch = trimmed.match(
    /(?:my\s+phone(?:\s+number)?\s+is|phone(?:\s+number)?\s+is|my\s+number\s+is|ስልክ\s*ቁጥሬ|lakkoofsi\s+bilbilaa\s+koo)\s*([+\d][\d\s-]{6,})/i
  );
  if (directPhoneMatch?.[1]) {
    const rawPhone = directPhoneMatch[1].trim().replace(/[.!?]+$/, '');
    if (activeModule === 'career' && careerState?.activeApplication) {
      await executeTool('update_job_application_answer', { contactValue: rawPhone });
      return {
        language: lang,
        replyText: localized(
          lang,
          `Entered your phone number ${rawPhone} on the job application form.`,
          `ስልክ ቁጥርዎን ${rawPhone} በስራ ማመልከቻው ላይ አስገብቻለሁ።`,
          `Lakkoofsa bilbilaa keessan ${rawPhone} iyyannoo hojii irratti galcheera.`
        ),
      };
    }
    const res = await executeTool('update_registration_answer', {
      contactMethod: 'phone',
      contactValue: rawPhone,
    });
    if (!res.ok) {
      return {
        language: lang,
        replyText: String(
          res.data.validationError ||
            'Please provide a valid Ethiopian phone number starting with 09, 07, or +251.'
        ),
      };
    }
    return {
      language: lang,
      replyText: localized(
        lang,
        `Entered your phone number (${rawPhone}) on the registration form. Say "continue" when ready for the next step.`,
        `ስልክ ቁጥርዎን (${rawPhone}) በምዝገባ ቅጹ ላይ አስገብቻለሁ።`,
        `Lakkoofsa bilbilaa keessan (${rawPhone}) unka galmee irratti galcheera.`
      ),
    };
  }

  // Direct full-name utterance ("My name is Ismael Awel") from any step/page (unless already answering step 2 full-name sequentially)
  const directNameMatch = trimmed.match(
    /^(?:my\s+full\s+name\s+is|my\s+name\s+is|ስሜ|maqaan\s+koo)\s+(.+)$/i
  );
  const isSequentialNameStep =
    (activeModule === 'onboarding' || activeModule === 'profile') &&
    onboardingState?.currentStepId === 'full-name';
  if (directNameMatch?.[1] && !isSequentialNameStep) {
    const cleanName = directNameMatch[1].trim().replace(/[.!?]+$/, '');
    if (cleanName) {
      if (activeModule === 'career' && careerState?.activeApplication) {
        await executeTool('update_job_application_answer', { applicantName: cleanName });
        return {
          language: lang,
          replyText: localized(
            lang,
            `Entered your name as ${cleanName} on the job application form.`,
            `ስምዎን ${cleanName} በስራ ማመልከቻው ላይ አስገብቻለሁ።`,
            `Maqaa keessan ${cleanName} iyyannoo hojii irratti galcheera.`
          ),
        };
      }
      await executeTool('update_registration_answer', { fullName: cleanName });
      return {
        language: lang,
        replyText: localized(
          lang,
          `Entered your name as ${cleanName} on the registration form. Say "now my email" or "now my phone number" to continue, or tell me your email directly.`,
          `ስምዎን ${cleanName} በምዝገባ ቅጹ ላይ አስገብቻለሁ። ኢሜይልዎን ወይም ስልክ ቁጥርዎን መናገር ይችላሉ።`,
          `Maqaa keessan ${cleanName} unka galmee irratti galcheera. Imeelii ykn lakkoofsa bilbilaa keessan dubbachuu dandeessu.`
        ),
      };
    }
  }

  const updateSkillsMatch =
    trimmed.match(/(?:update|add|change|set)\s+(?:my\s+)?skills?\s+(?:to|as|with)?\s*(.+)/i) ||
    trimmed.match(/(?:ችሎታዎቼን)\s+(.+)/i) ||
    trimmed.match(/(?:dandeettii\s+koo)\s+(.+)/i);
  if (updateSkillsMatch?.[1] || /\b(update|edit)\s+(my\s+)?skills?\b/i.test(lower)) {
    const newSkills = updateSkillsMatch?.[1]?.trim().replace(/[.!?]+$/, '');
    if (!newSkills) {
      return {
        language: lang,
        replyText: localized(
          lang,
          'Tell me the skills you want to add or update on your profile or application.',
          'በመገለጫዎ ላይ ማከል የሚፈልጓቸውን ችሎታዎች ይንገሩኝ።',
          'Dandeettii dabaluu barbaaddan natti himaa.'
        ),
      };
    }
    if (activeModule === 'career' && careerState?.activeApplication) {
      await executeTool('update_job_application_answer', { relevantExperience: newSkills });
      return {
        language: lang,
        replyText: localized(
          lang,
          `Updated your job application experience/skills to: ${newSkills}.`,
          `በስራ ማመልከቻዎ ላይ ችሎታዎን ወደ "${newSkills}" አስተካክያለሁ።`,
          `Iyyannoo hojii keessan irratti dandeettii gara "${newSkills}" tti sirreesseera.`
        ),
      };
    }
    if (stateSnapshot.savedLearnerProfile) {
      session.pendingAction = 'update_profile';
      session.pendingArgs = { supportNotes: `Skills: ${newSkills}` };
      return {
        language: lang,
        replyText: localized(
          lang,
          `I can save your skills ("${newSkills}") to your profile notes. Say "yes" to confirm.`,
          `ችሎታዎችዎን ("${newSkills}") በመገለጫዎ ላይ ማስቀመጥ እችላለሁ። ለማረጋገጥ "አዎ" ይበሉ።`,
          `Dandeettii keessan ("${newSkills}") piroofayilii irratti kuusuu nan danda'a. Mirkaneessuuf "Eeyyee" jedhaa.`
        ),
      };
    }
    await executeTool('navigate_to_page', { page: 'profile' });
    return {
      language: lang,
      replyText: localized(
        lang,
        `I opened My Profile. Complete registration first to save skills (${newSkills}) permanently, or share them during any job application.`,
        `መገለጫዬን ከፍቻለሁ። ችሎታዎችን በቋሚነት ለማስቀመጥ በመጀመሪያ ይመዝገቡ።`,
        `Piroofayilii koo baneera. Dandeettii kuusuuf jalqaba galmaa'aa.`
      ),
    };
  }

  // 5. Learning Resources queries (search, read course description, open, enroll)
  if (
    /\b(read this course|course description|explain this course|open this learning resource)\b/i.test(lower)
  ) {
    const res = await executeTool('get_learning_resources', {
      category: session.lastLearningCategory || 'all',
      navigateToLearning: true,
    });
    const tracks = (res.data.tracks as Array<{ id: string; title: string; duration: string; summary: string; assistiveNotes: string[]; outcomes: string[] }>) || [];
    const selected =
      tracks.find((tr) => tr.id === session.referencedTrackId) || tracks[0];
    if (!selected) {
      return {
        language: lang,
        replyText: 'I opened Learning Resources, and no matching course description is selected yet.',
      };
    }
    session.referencedTrackId = selected.id;
    return {
      language: lang,
      replyText: localized(
        lang,
        `${selected.title} (${selected.duration}). Description: ${selected.summary} Assistive notes: ${selected.assistiveNotes.join(' ')}. Outcomes: ${selected.outcomes.join(', ')}. Say "help me enroll" to start learner registration.`,
        `${selected.title} (${selected.duration})። መግለጫ፦ ${selected.summary}። ለመመዝገብ "ለመመዝገብ እርዳኝ" ይበሉ።`,
        `${selected.title} (${selected.duration}). Ibsa: ${selected.summary}. Galmaa'uuf "akka galmaa'u na gargaari" jedhaa.`
      ),
    };
  }

  if (/\b(enroll|enroll in|join course|join this course|register for this course)\b/i.test(lower)) {
    await executeTool('start_registration', { mode: 'self' });
    return {
      language: lang,
      replyText: localized(
        lang,
        `To enroll in ALX learning programs, I opened Learner Registration step 1. ${formatRegistrationPrompt('device-privacy', lang)}`,
        `በALX የትምህርት ፕሮግራሞች ለመመዝገብ የተማሪ ምዝገባ ደረጃ 1ን ከፍቻለሁ። ${formatRegistrationPrompt('device-privacy', lang)}`,
        `Sagantaa barnoota ALX keessatti galmaa'uuf Galmee Barataa sadarkaa 1ffaa baneera. ${formatRegistrationPrompt('device-privacy', lang)}`
      ),
    };
  }

  if (
    /\b(learning resource|learning|course|courses|training|alx|software engineering|data science|ai essentials|assistive tech|javascript|python|free courses)\b/i.test(lower) ||
    /(ትምህርት|ስልጠና|ኮርስ|barnoota|leenjii)/i.test(lower)
  ) {
    const isJavascript = /\bjavascript\b/i.test(lower);
    const isFree = /\bfree\b/i.test(lower);
    const category = isJavascript || /(software|coding|se\b|typescript|python|web)/i.test(lower)
      ? 'se'
      : /(data\s*science|analytics|sql)/i.test(lower)
      ? 'data'
      : /(\bai\b|artificial)/i.test(lower)
      ? 'ai'
      : /(assistive|screen reader|braille)/i.test(lower)
      ? 'a11y'
      : 'all';
    session.lastLearningCategory = category;
    const res = await executeTool('get_learning_resources', {
      category,
      navigateToLearning: true,
    });
    const tracks = (res.data.tracks as Array<{ id: string; title: string; duration: string; summary: string; assistiveNotes: string[]; outcomes: string[] }>) || [];
    session.lastTracksList = tracks;
    if (tracks[0]) session.referencedTrackId = tracks[0].id;
    const listText = tracks.map((tr) => `${tr.title} (${tr.duration})`).join(', ');
    const prefixNote = isFree
      ? 'All accessible guides on this platform are open to explore; sponsored ALX tracks depend on cohort eligibility. '
      : isJavascript
      ? 'Here is the closest web & software engineering track matching JavaScript/TypeScript foundations: '
      : '';
    return {
      language: lang,
      replyText: localized(
        lang,
        `I opened ALX Learning Resources. ${prefixNote}Found ${tracks.length} accessible ${tracks.length === 1 ? 'track' : 'tracks'}: ${listText}. Say "read this course description" to hear full details or "help me enroll".`,
        `የALX የመማሪያ መርጃዎችን ከፍቻለሁ። ${tracks.length} ተደራሽ ትምህርቶች ይታያሉ፦ ${listText}።`,
        `Qabeenya Barnootaa ALX baneera. Koorsoota mijatoo ${tracks.length} ni argamu: ${listText}.`
      ),
    };
  }

  // 6. Active Job Application conversational steps
  const activeApp = careerState?.activeApplication;
  if (activeModule === 'career' && activeApp) {
    if (
      /\b(explain this form|explain the form|help with this form|explain this step|explain why|why do you ask)\b/i.test(
        lower
      )
    ) {
      return {
        language: lang,
        replyText: localized(
          lang,
          `You are filling out the Job Application form for ${activeApp.jobTitle} (step ${activeApp.stepIndex + 1} of 4). Speak your answer for the current step, say "skip" on optional steps, "back", or "cancel application".`,
          `ለ${activeApp.jobTitle} የስራ ማመልከቻ ቅጽ እየሞሉ ነው (ደረጃ ${activeApp.stepIndex + 1} ከ4)። መልስዎን ይናገሩ ወይም "ዝለል" / "ተመለስ" ይበሉ።`,
          `Unka Iyyannoo Hojii ${activeApp.jobTitle} guutaa jirtu (sadarkaa ${activeApp.stepIndex + 1}ffaa). Deebii keessan dubbadhaa ykn "irra darbi" / "duubatti" jedhaa.`
        ),
      };
    }

    if (/\b(cancel|back to jobs|exit application)\b/i.test(lower) || /(ሰርዝ|ተመለስ|haqi)/i.test(lower)) {
      if (/\b(cancel|exit)\b/i.test(lower) || /(ሰርዝ|haqi)/i.test(lower)) {
        await executeTool('control_job_application_flow', { action: 'cancel' });
        return {
          language: lang,
          replyText: localized(
            lang,
            'Closed the job application and returned to the Accessible Jobs list.',
            'የስራ ማመልከቻውን ዘግቼ ወደ ተደራሽ ስራዎች ዝርዝር ተመልሻለሁ።',
            'Iyyannoo hojii cufee gara tarree hojiiwwan mijatootti deebi\'eera.'
          ),
        };
      }
      const backRes = await executeTool('control_job_application_flow', { action: 'back' });
      return {
        language: lang,
        replyText: localized(
          lang,
          `Moved back to application step ${Number(backRes.data.stepIndex || 0) + 1}.`,
          'ወደ ቀዳሚው የማመልከቻ ደረጃ ተመልሻለሁ።',
          'Gara sadarkaa iyyannoo duraatti deebi\'eera.'
        ),
      };
    }

    if (activeApp.isReviewStep || /\b(submit|send application|finish)\b/i.test(lower) || /(ላክ|ergi)/i.test(lower)) {
      if (isAffirmative(trimmed) || /\bsubmit\b/i.test(lower)) {
        const res = await executeTool('submit_job_application', { confirmed: true });
        if (res.ok) {
          const receipt = res.data.receipt as { id?: string } | undefined;
          return {
            language: lang,
            replyText: localized(
              lang,
              `Submitted! Your application for ${activeApp.jobTitle} is complete with reference ID ${receipt?.id || 'APP'}.`,
              `ተልኳል! ለ${activeApp.jobTitle} ያቀረቡት ማመልከቻ በማጣቀሻ ${receipt?.id || 'APP'} ተጠናቋል።`,
              `Ergameera! Iyyannoon keessan ${activeApp.jobTitle} tiif lakkoofsa wabii ${receipt?.id || 'APP'} tiin xumurameera.`
            ),
          };
        }
        return { language: lang, replyText: String(res.data.error || 'Please check required application fields.') };
      }
      session.pendingAction = 'submit_job_application';
      return {
        language: lang,
        replyText: localized(
          lang,
          `Reviewing your application for ${activeApp.jobTitle}: Name ${String(activeApp.draft.applicantName || '')}, Contact ${String(activeApp.draft.contactValue || '')}, Experience: ${String(activeApp.draft.relevantExperience || 'Skipped')}. Say "yes, submit" to confirm sending.`,
          `ለ${activeApp.jobTitle} ያቀረቡትን ማመልከቻ ይገምግሙ፦ ስም ${String(activeApp.draft.applicantName || '')}፣ መገናኛ ${String(activeApp.draft.contactValue || '')}። ለመላክ "አዎ ላክ" ይበሉ።`,
          `Iyyannoo keessan ${activeApp.jobTitle} ilaalaa: Maqaa ${String(activeApp.draft.applicantName || '')}, Qunnamtii ${String(activeApp.draft.contactValue || '')}. Erguuf "Eeyyee ergi" jedhaa.`
        ),
      };
    }

    if (/\b(skip|next|continue)\b/i.test(lower) || /(ዝለል|ቀጥል|irra darbi|itti fufi)/i.test(lower)) {
      const flow = await executeTool('control_job_application_flow', { action: /\bskip\b|ዝለል|irra darbi/i.test(lower) ? 'skip' : 'next' });
      if (flow.data.isReviewStep) {
        session.pendingAction = 'submit_job_application';
        return {
          language: lang,
          replyText: localized(
            lang,
            `Ready to review your application for ${activeApp.jobTitle}. Applicant: ${String(activeApp.draft.applicantName || '')}, Contact: ${String(activeApp.draft.contactValue || '')}. Say "yes, submit" to submit.`,
            `ለ${activeApp.jobTitle} የሞሉትን ለመገምገም ዝግጁ ነው። ለመላክ "አዎ ላክ" ይበሉ።`,
            `Iyyannoo ${activeApp.jobTitle} mirkaneessuuf qophaa'eera. Erguuf "Eeyyee ergi" jedhaa.`
          ),
        };
      }
      const nextStep = Number(flow.data.stepIndex || 0);
      const prompts = [
        localized(lang, 'Step 1: What is your full name?', 'ደረጃ 1፦ ሙሉ ስምዎ ማን ነው?', 'Sadarkaa 1: Maqaan keessan guutuun eenyu?'),
        localized(lang, 'Step 2: What is your phone number or email?', 'ደረጃ 2፦ ስልክ ቁጥርዎ ወይም ኢሜይልዎ ምንድን ነው?', 'Sadarkaa 2: Lakkoofsi bilbilaa ykn imeeliin keessan maali?'),
        localized(lang, 'Step 3 (optional): Tell me briefly about your skills or experience, or say "skip".', 'ደረጃ 3 (አማራጭ)፦ ስለ ልምድዎ በአጭሩ ይንገሩኝ ወይም "ዝለል" ይበሉ።', 'Sadarkaa 3 (filannoo): Muuxannoo ykn dandeettii keessan himaa ykn "irra darbi" jedhaa.'),
        localized(lang, 'Step 4 (optional): Would you like to share an interview accommodation request with the employer? Say "no, keep private" or tell me your accommodation request and confirm sharing.', 'ደረጃ 4 (አማራጭ)፦ ለቃለ መጠይቅ የተደራሽነት ድጋፍ ጥያቄ ለቀጣሪው ማጋራት ይፈልጋሉ? "አይ" ይበሉ ወይም ጥያቄዎን ይንገሩኝ።', 'Sadarkaa 4 (filannoo): Gaaffii mijatinaa hojjechiisaadhaaf qooduu barbaadduu? "Lakkii" jedhaa ykn gaaffii keessan himaa.'),
      ];
      return { language: lang, replyText: prompts[nextStep] || prompts[0] };
    }

    // Fill active application step
    if (activeApp.stepIndex === 0) {
      const name = trimmed.replace(/^(my name is|i am|ስሜ)\s+/i, '').trim();
      await executeTool('update_job_application_answer', { applicantName: name, advanceToNextStep: true });
      return {
        language: lang,
        replyText: localized(
          lang,
          `Entered your name as ${name}. Step 2: What phone number or email should the employer use to reach you?`,
          `ስምዎን ${name} ብዬ አስገብቻለሁ። ደረጃ 2፦ ቀጣሪው የሚያገኝዎት ስልክ ቁጥር ወይም ኢሜይል ምንድን ነው?`,
          `Maqaa keessan ${name} jedhee galcheera. Sadarkaa 2: Lakkoofsi bilbilaa ykn imeeliin keessan maali?`
        ),
      };
    }
    if (activeApp.stepIndex === 1) {
      await executeTool('update_job_application_answer', { contactValue: trimmed, advanceToNextStep: true });
      return {
        language: lang,
        replyText: localized(
          lang,
          `Saved contact ${trimmed}. Step 3 (optional): Briefly share your relevant experience, or say "skip".`,
          `መገናኛ ${trimmed} ተቀምጧል። ደረጃ 3 (አማራጭ)፦ ተዛማጅ ልምድዎን ይናገሩ ወይም "ዝለል" ይበሉ።`,
          `Qunnamtiin ${trimmed} kuufameera. Sadarkaa 3 (filannoo): Muuxannoo keessan himaa ykn "irra darbi" jedhaa.`
        ),
      };
    }
    if (activeApp.stepIndex === 2) {
      await executeTool('update_job_application_answer', { relevantExperience: trimmed, advanceToNextStep: true });
      return {
        language: lang,
        replyText: localized(
          lang,
          'Saved your experience. Step 4 (optional): Do you want to share an interview accommodation request with the employer, or keep it private? Say "keep private" or tell me your accommodation request.',
          'ልምድዎ ተቀምጧል። ደረጃ 4 (አማራጭ)፦ ለቃለ መጠይቅ የተደራሽነት ድጋፍ ጥያቄ ለቀጣሪው ማጋራት ይፈልጋሉ? "በሚስጥር ይቆይ" ይበሉ ወይም ጥያቄዎን ይግለጹ።',
          'Muuxannoon kuufameera. Sadarkaa 4 (filannoo): Gaaffii mijatinaa qooduu barbaadduu? "Iccitiin qabi" jedhaa ykn gaaffii keessan himaa.'
        ),
      };
    }
    if (activeApp.stepIndex === 3) {
      const keepPrivate = isNegative(trimmed) || /\b(private|no|don't share|without sharing)\b/i.test(lower);
      if (keepPrivate) {
        await executeTool('update_job_application_answer', {
          shareAccommodationRequest: false,
          explicitConsentToShare: false,
          advanceToNextStep: true,
        });
      } else {
        await executeTool('update_job_application_answer', {
          shareAccommodationRequest: true,
          accommodationRequestNote: trimmed,
          explicitConsentToShare: true,
          advanceToNextStep: true,
        });
      }
      await executeTool('control_job_application_flow', { action: 'review' });
      session.pendingAction = 'submit_job_application';
      return {
        language: lang,
        replyText: localized(
          lang,
          `Ready to review your application for ${activeApp.jobTitle}. Name: ${String(activeApp.draft.applicantName || '')}, Contact: ${String(activeApp.draft.contactValue || '')}. Say "yes, submit" to send your application.`,
          `ለ${activeApp.jobTitle} ያዘጋጁት ማመልከቻ ለመላክ ዝግጁ ነው። ለመላክ "አዎ ላክ" ይበሉ።`,
          `Iyyannoon ${activeApp.jobTitle} ergamuuf qophaa'eera. Erguuf "Eeyyee ergi" jedhaa.`
        ),
      };
    }
  }

  // 7. Job Details / Apply / Search & Contextual Refinement intents
  if (/\b(apply|application)\b/i.test(lower) || /(ማመልከት|አመልክት|iyyadhu)/i.test(lower)) {
    const id = extractJobIdentifier(lower, session);
    const res = await executeTool('start_job_application', { jobIdentifier: id });
    if (!res.ok) {
      return { language: lang, replyText: String(res.data.error || 'Please search jobs first.') };
    }
    const jobTitle = String(res.data.jobTitle || '');
    const org = String(res.data.organization || '');
    const preName = res.data.prefilledName ? String(res.data.prefilledName) : '';
    const preContact = res.data.prefilledContact ? String(res.data.prefilledContact) : '';
    if (preName && preContact) {
      await executeTool('control_job_application_flow', { action: 'next' });
      await executeTool('control_job_application_flow', { action: 'next' });
      return {
        language: lang,
        replyText: localized(
          lang,
          `Started application for ${jobTitle} at ${org}, prefilled with ${preName} and ${preContact}. Step 3 (optional): Tell me your relevant experience, or say "skip" or "review".`,
          `በ${org} ለሚገኘው ${jobTitle} ስራ ማመልከቻ በ${preName} ስም ጀምሬያለሁ። ደረጃ 3 (አማራጭ)፦ ልምድዎን ይናገሩ ወይም "ዝለል" ይበሉ።`,
          `Iyyannoon hojii ${jobTitle} (${org}) maqaa ${preName} tiin eegalameera. Sadarkaa 3 (filannoo): Muuxannoo keessan himaa ykn "irra darbi" jedhaa.`
        ),
      };
    }
    return {
      language: lang,
      replyText: localized(
        lang,
        `Opened job application for ${jobTitle} at ${org}. Question 1: What is your full name?`,
        `በ${org} ለሚገኘው ${jobTitle} ስራ ማመልከቻ ከፍቻለሁ። ጥያቄ 1፦ ሙሉ ስምዎ ማን ነው?`,
        `Iyyannoo hojii ${jobTitle} (${org}) baneera. Gaaffii 1: Maqaan keessan guutuun eenyu?`
      ),
    };
  }

  // Contextual "Read the first one", "Read requirements", "Details about it"
  if (
    /\b(details|read|explain|tell me about|requirements)\b.*\b(job|role|position|first|second|third|one|it|that|1|2|3|requirements)\b/i.test(lower) ||
    /^(read the first one|read the second one|read the third one|read requirements|read that one|read it)$/i.test(lower) ||
    /(ስለ.*ስራ.*ንገረኝ|ibsa hojii)/i.test(lower)
  ) {
    const id = extractJobIdentifier(lower, session);
    const res = await executeTool('get_job_details', { jobIdentifier: id });
    if (!res.ok) {
      return { language: lang, replyText: String(res.data.error || 'Could not find that job. Say "read the available jobs" first.') };
    }
    const j = res.data.job as {
      id: string;
      title: string;
      organization: string;
      location: string;
      isRemote: boolean;
      descriptionSummary: string;
      accommodationsOffered: string[];
      requiredSkills: string[];
    };
    session.referencedJobId = j.id;
    return {
      language: lang,
      replyText: localized(
        lang,
        `${j.title} at ${j.organization} (${j.location}${j.isRemote ? ', Remote' : ''}). Summary: ${j.descriptionSummary} Requirements and skills: ${j.requiredSkills.join(', ')}. Accommodations offered: ${j.accommodationsOffered.join(', ')}. Say "apply for it" whenever you are ready.`,
        `በ${j.organization} የሚገኝ ${j.title} (${j.location})። ማጠቃለያ፦ ${j.descriptionSummary}። የሚፈለጉ ችሎታዎች፦ ${j.requiredSkills.join(', ')}። የሚሰጡ የተደራሽነት ድጋፎች፦ ${j.accommodationsOffered.join(', ')}። ለማመልከት ዝግጁ ሲሆኑ "ለዚህ ስራ አመልክት" ይበሉ።`,
        `${j.title} dhaabbata ${j.organization} (${j.location}). Cuunfaa: ${j.descriptionSummary}. Dandeettii barbaachisu: ${j.requiredSkills.join(', ')}. Mijatinawwan kennaman: ${j.accommodationsOffered.join(', ')}. Iyyachuuf yoo qophooftan "hojii kanaaf iyyadhu" jedhaa.`
      ),
    };
  }

  // Contextual refinement ("Only remote ones", "Show only remote jobs", "Suitable for beginners")
  const isRemoteRefinement = /\b(only remote|remote ones|just remote|filter.*remote)\b/i.test(lower);
  const isBeginnerRefinement = /\b(beginner|entry|junior|suitable for beginners)\b/i.test(lower);

  if (
    isRemoteRefinement ||
    isBeginnerRefinement ||
    /\b(jobs|job|work|career|hiring|vacancies|read the available jobs|screen reader jobs)\b/i.test(lower) ||
    /(ስራዎች|ስራ ፈልግ|ተደራሽ ስራ|hojiiwwan|hojii barbaadi)/i.test(lower)
  ) {
    const showAll = /\b(all jobs|clear filters|available jobs)\b/i.test(lower);
    let categories = showAll ? [] : extractCategoriesFromText(lower);
    let query = showAll ? '' : extractJobKeywordQuery(trimmed);

    if (isRemoteRefinement) {
      const prevCats = session.lastJobCategories || [];
      categories = Array.from(new Set<AccommodationCategory>([...prevCats, 'remote_flexible']));
      query = query || session.lastJobQuery || '';
    }
    if (isBeginnerRefinement && !query) {
      query = 'Junior';
    }

    session.lastJobQuery = query;
    session.lastJobCategories = categories;

    const res = await executeTool('search_jobs', {
      query,
      categories,
      clearFilters: true,
      navigateToCareers: true,
    });
    const jobs = (res.data.jobs as Array<{ index: number; id: string; title: string; organization: string; isRemote: boolean; requiredSkills?: string[] }>) || [];
    session.lastJobsList = jobs;
    if (jobs[0]) {
      session.referencedJobId = jobs[0].id;
    }

    if (jobs.length === 0) {
      return {
        language: lang,
        replyText: localized(
          lang,
          'I opened Accessible Jobs, and no jobs matched those exact filters. Say "show all jobs" to clear filters.',
          'ተደራሽ ስራዎችን ከፍቻለሁ፣ ነገር ግን ከእነዚህ ማጣሪያዎች ጋር የሚስማማ ስራ አልተገኘም። ሁሉንም ለማየት "ሁሉንም ስራዎች አሳይ" ይበሉ።',
          'Hojiiwwan mijatoo baneera, garuu hojiin qulqulleessa kanaan walsimu hin argamne. Hunda arguuf "hojiiwwan hunda agarsiisi" jedhaa.'
        ),
      };
    }
    const topSummary = jobs
      .slice(0, 3)
      .map((j) => `${j.index}. ${j.title} at ${j.organization}${j.isRemote ? ' (Remote)' : ''}`)
      .join('; ');
    return {
      language: lang,
      replyText: localized(
        lang,
        `I opened Accessible Jobs and found ${jobs.length} matching ${jobs.length === 1 ? 'role' : 'roles'}: ${topSummary}. Ask to "read the first one" or say "apply for job 1".`,
        `ተደራሽ ስራዎችን ከፍቻለሁ። ${jobs.length} ተስማሚ ስራዎች ተገኝተዋል፦ ${topSummary}። ስለ አንዱ ዝርዝር ለመስማት ወይም ለማመልከት ይጠይቁኝ።`,
        `Hojiiwwan mijatoo baneera. Hojiiwwan mijatoo ${jobs.length} argamaniiru: ${topSummary}. Ibsa dabalataaf ykn iyyachuuf na gaafadhaa.`
      ),
    };
  }

  // Explicit on-demand "Explain this form" outside onboarding too
  if (/\b(explain this form|explain the form|help with this form)\b/i.test(lower)) {
    if (activeModule === 'onboarding' || activeModule === 'profile') {
      const stepId = onboardingState?.currentStepId || 'device-privacy';
      return {
        language: lang,
        replyText: `${formatRegistrationExplanation(stepId, lang)} ${formatRegistrationPrompt(stepId, lang)}`,
      };
    }
    if (activeModule === 'employer') {
      return {
        language: lang,
        replyText: 'This Employer Accommodation Form lets employers publish accessible roles by describing workplace support, remote flexibility, assistive technology, and interview accommodations. Medical diagnosis or disability proof questions are automatically blocked.',
      };
    }
    return {
      language: lang,
      replyText: 'There is no active registration form open on this screen right now. Say "start registration" to open the accessible learner form, or "find jobs" to browse roles.',
    };
  }

  // 8. Start Registration explicitly
  if (
    /\b(start registration|open registration|go to registration|open onboarding|start onboarding|register me|i want to register|sign me up|begin onboarding|partner assisted)\b/i.test(lower) ||
    /(መመዝገብ እፈልጋለሁ|ምዝገባ ጀምር|ምዝገባ ክፈት|galmaa'uu barbaada|galmee jalqabi|galmee bani)/i.test(lower)
  ) {
    const mode = /(partner|አጋር|michuu)/i.test(lower) ? 'partner_assisted' : 'self';
    await executeTool('start_registration', { mode });
    return {
      language: lang,
      replyText: localized(
        lang,
        `I opened Learner Registration and started step 1. No Kebele ID, passport, or medical proof is required. ${formatRegistrationPrompt('device-privacy', lang)}`,
        `የተማሪ ምዝገባን ከፍቼ ደረጃ 1ን ጀምሬያለሁ። የቀበሌ መታወቂያ ወይም የህክምና ማስረጃ አያስፈልግም። ${formatRegistrationPrompt('device-privacy', lang)}`,
        `Galmee barataa banee sadarkaa 1ffaa jalqabeera. Waraqaan eenyummaa gandaa ykn ragaan yaalaa hin barbaachisu. ${formatRegistrationPrompt('device-privacy', lang)}`
      ),
    };
  }

  // 9. Active Registration / Profile Step-by-Step Conversation
  if (activeModule === 'onboarding' || activeModule === 'profile') {
    const stepId = onboardingState?.currentStepId || 'device-privacy';

    if (/\b(explain|why|what does this mean)\b/i.test(lower) || /(አብራራ|ለምን|ibsi|maaliif)/i.test(lower)) {
      return {
        language: lang,
        replyText: `${formatRegistrationExplanation(stepId, lang)} ${formatRegistrationPrompt(stepId, lang)}`,
      };
    }

    if (/\b(repeat|say again|what is the question)\b/i.test(lower) || /(ድገም|irra deebi'i)/i.test(lower)) {
      return {
        language: lang,
        replyText: onboardingState?.isReviewStep
          ? formatRegistrationReviewSummary(onboardingState.filledSummary || {}, lang)
          : formatRegistrationPrompt(stepId, lang),
      };
    }

    if (/\b(cancel|stop registration|exit)\b/i.test(lower) || /(ምዝገባ ሰርዝ|galmee haqi)/i.test(lower)) {
      await executeTool('control_registration_flow', { action: 'cancel' });
      return {
        language: lang,
        replyText: localized(
          lang,
          'Cancelled registration and returned to Home.',
          'ምዝገባውን ሰርዤ ወደ መነሻ ገጽ ተመልሻለሁ።',
          'Galmee haqee gara fuula duraatti deebi\'eera.'
        ),
      };
    }

    if (/\b(back|previous|previous step|go back)\b/i.test(lower) || /(ወደ ኋላ|ተመለስ|duubatti)/i.test(lower)) {
      const res = await executeTool('control_registration_flow', { action: 'back' });
      const prevId = String((res.data.currentStep as { id?: string })?.id || 'device-privacy');
      return { language: lang, replyText: formatRegistrationPrompt(prevId, lang) };
    }

    if (/\b(skip|skip this|prefer not)\b/i.test(lower) || /(ዝለል|irra darbi)/i.test(lower)) {
      if (stepId === 'contact') {
        await executeTool('update_registration_answer', { contactMethod: 'none', advanceToNextStep: true });
        return { language: lang, replyText: formatRegistrationPrompt('identity-route', lang) };
      }
      const res = await executeTool('control_registration_flow', { action: 'skip' });
      if (!res.ok) {
        return {
          language: lang,
          replyText: `${String(res.data.error || 'This step is required.')} ${formatRegistrationPrompt(stepId, lang)}`,
        };
      }
      if (res.data.isReviewStep) {
        session.pendingAction = 'submit_registration';
        return {
          language: lang,
          replyText: formatRegistrationReviewSummary(res.data.summary as Record<string, unknown>, lang),
        };
      }
      const nextId = String((res.data.currentStep as { id?: string })?.id || 'full-name');
      return { language: lang, replyText: formatRegistrationPrompt(nextId, lang) };
    }

    if (/\b(review|summary)\b/i.test(lower) || /(ገምግም|cuunfaa)/i.test(lower)) {
      const res = await executeTool('control_registration_flow', { action: 'review' });
      if (!res.ok) {
        const errs = (res.data.validationErrors as Array<{ message: string }>) || [];
        return { language: lang, replyText: errs.map((e) => e.message).join(' ') };
      }
      session.pendingAction = 'submit_registration';
      return {
        language: lang,
        replyText: formatRegistrationReviewSummary(res.data.summary as Record<string, unknown>, lang),
      };
    }

    if (onboardingState?.isReviewStep || /\b(submit|finish|send)\b/i.test(lower) || /(ላክ|ergi)/i.test(lower)) {
      if (isAffirmative(trimmed) || /\b(submit|finish)\b/i.test(lower)) {
        const res = await executeTool('submit_registration', { confirmed: true });
        if (res.ok) {
          const receipt = res.data.receipt as { id?: string } | undefined;
          return {
            language: lang,
            replyText: localized(
              lang,
              `Confirmed! Your registration is submitted. Reference ID: ${receipt?.id || 'SAV'}.`,
              `ተረጋግጧል! ምዝገባዎ ተልኳል። የማጣቀሻ ቁጥር፦ ${receipt?.id || 'SAV'}።`,
              `Mirkanaa'eera! Galmeen keessan ergameera. Lakkoofsa wabii: ${receipt?.id || 'SAV'}.`
            ),
          };
        }
        if (res.data.confirmationRequired) {
          session.pendingAction = 'submit_registration';
          return {
            language: lang,
            replyText: formatRegistrationReviewSummary(res.data.summary as Record<string, unknown>, lang),
          };
        }
        const errs = (res.data.validationErrors as Array<{ message: string }>) || [];
        return {
          language: lang,
          replyText: errs.length > 0 ? errs.map((e) => e.message).join(' ') : String(res.data.error || 'Could not submit yet.'),
        };
      }
      session.pendingAction = 'submit_registration';
      return {
        language: lang,
        replyText: formatRegistrationReviewSummary(onboardingState?.filledSummary || {}, lang),
      };
    }

    // Answer handling for the active registration question
    if (stepId === 'device-privacy') {
      const shared = isAffirmative(trimmed) || /\bshared|public\b/i.test(lower) || /(የጋራ|waliinii)/i.test(lower);
      await executeTool('update_registration_answer', { isSharedDevice: shared, advanceToNextStep: true });
      return {
        language: lang,
        replyText: localized(
          lang,
          `${shared ? 'Noted as shared device — nothing will stay saved here.' : 'Noted as your own device.'} ${formatRegistrationPrompt('full-name', lang)}`,
          `${shared ? 'የጋራ መሳሪያ መሆኑ ተመዝግቧል።' : 'የግል መሳሪያ መሆኑ ተመዝግቧል።'} ${formatRegistrationPrompt('full-name', lang)}`,
          `${shared ? 'Meeshaa waliinii ta\'uun galmaa\'eera.' : 'Meeshaa dhuunfaa ta\'uun galmaa\'eera.'} ${formatRegistrationPrompt('full-name', lang)}`
        ),
      };
    }

    if (stepId === 'full-name') {
      const cleanName = trimmed
        .replace(/^(my full name is|my name is|i am|this is|call me|ስሜ|maqaan\s+koo)\s+/i, '')
        .replace(/[.!?]+$/, '')
        .trim();
      const res = await executeTool('update_registration_answer', {
        fullName: cleanName,
        advanceToNextStep: true,
      });
      if (!res.ok) {
        const errs = (res.data.validationErrors as string[]) || [];
        return { language: lang, replyText: errs[0] || formatRegistrationPrompt('full-name', lang) };
      }
      return {
        language: lang,
        replyText: localized(
          lang,
          `Saved your name as ${cleanName}. ${formatRegistrationPrompt('contact', lang)}`,
          `ስምዎን ${cleanName} ብዬ አስገብቻለሁ። ${formatRegistrationPrompt('contact', lang)}`,
          `Maqaa keessan ${cleanName} jedhee galcheera. ${formatRegistrationPrompt('contact', lang)}`
        ),
      };
    }

    if (stepId === 'contact') {
      const noContact = isNegative(trimmed) || /\b(none|prefer not|don't share)\b/i.test(lower);
      const args: Record<string, unknown> = noContact
        ? { contactMethod: 'none', advanceToNextStep: true }
        : trimmed.includes('@')
        ? { contactMethod: 'email', contactValue: trimmed, advanceToNextStep: true }
        : /\bpartner\b/i.test(lower)
        ? { contactMethod: 'partner_contact', contactValue: trimmed, advanceToNextStep: true }
        : { contactMethod: 'phone', contactValue: trimmed, advanceToNextStep: true };

      const res = await executeTool('update_registration_answer', args);
      if (!res.ok) {
        const errMsg =
          String(res.data.validationError || '') ||
          ((res.data.validationErrors as string[]) || []).join(' ');
        return {
          language: lang,
          replyText: `${errMsg} Please enter a valid Ethiopian phone number starting with 09, 07, or +251, an email, or say "skip".`,
        };
      }
      return {
        language: lang,
        replyText: localized(
          lang,
          `Saved your contact option. ${formatRegistrationPrompt('identity-route', lang)}`,
          `የመገናኛ ምርጫዎ ተቀምጧል። ${formatRegistrationPrompt('identity-route', lang)}`,
          `Filannoon qunnamtii kuufameera. ${formatRegistrationPrompt('identity-route', lang)}`
        ),
      };
    }

    if (stepId === 'identity-route') {
      let route: IdentityRoute | null = null;
      if (/(no document|don't have|do not have|without id|no id|none|ሰነድ የለኝም|መታወቂያ የለኝም|hin qabu|sanada malee)/i.test(lower)) {
        route = 'no_documents';
      } else if (/(national|fayda|kebele|ብሔራዊ|ፋይዳ|biyyaalessaa)/i.test(lower)) {
        route = 'national_id';
      } else if (/(refugee|unhcr|rrs|ስደተኛ|baqataa)/i.test(lower)) {
        route = 'refugee_id';
      } else if (/(partner|referral|ngo|ድርጅት|michuu)/i.test(lower)) {
        route = 'partner_referral';
      } else if (/(other|student|community|letter|ሌላ|biraa)/i.test(lower)) {
        route = 'other_document';
      }

      if (!route) {
        return { language: lang, replyText: formatRegistrationPrompt('identity-route', lang) };
      }

      const res = await executeTool('update_registration_answer', {
        identityRoute: route,
        advanceToNextStep: true,
      });
      const nextStepId = String((res.data.currentStep as { id?: string })?.id || 'private-support');
      return {
        language: lang,
        replyText: localized(
          lang,
          `Selected identity option: ${route.replace('_', ' ')}. ${formatRegistrationPrompt(nextStepId, lang)}`,
          `የመታወቂያ አማራጭ ተመርጧል። ${formatRegistrationPrompt(nextStepId, lang)}`,
          `Filannoon eenyummaa filatameera. ${formatRegistrationPrompt(nextStepId, lang)}`
        ),
      };
    }

    if (stepId === 'private-support') {
      const prefs: SupportPreference[] = [];
      if (/(help completing|help filling)/i.test(lower)) prefs.push('help_completing');
      if (/(sign language|communication|interpreter|caption)/i.test(lower)) prefs.push('communication_assistance');
      if (/(screen reader|large text|audio|braille|alternative)/i.test(lower)) prefs.push('alternative_materials');
      if (/(flexible|extra time|schedule)/i.test(lower)) prefs.push('flexible_scheduling');
      if (/(discuss privately|coordinator)/i.test(lower)) prefs.push('discuss_privately');

      const noSupport = isNegative(trimmed) || /\b(none|no support)\b/i.test(lower);
      const res = await executeTool('update_registration_answer', {
        supportPreferences: prefs,
        supportNotes: noSupport ? '' : trimmed,
        advanceToNextStep: true,
      });

      if (res.data.isReviewStep) {
        session.pendingAction = 'submit_registration';
        return {
          language: lang,
          replyText: formatRegistrationReviewSummary(res.data.summary as Record<string, unknown>, lang),
        };
      }
      const nextStepId = String((res.data.currentStep as { id?: string })?.id || 'partner-consent');
      return { language: lang, replyText: formatRegistrationPrompt(nextStepId, lang) };
    }

    if (stepId === 'partner-consent') {
      await executeTool('update_registration_answer', {
        partnerOrganizationName: trimmed,
        learnerConsented: true,
        advanceToNextStep: true,
      });
      session.pendingAction = 'submit_registration';
      const status = await executeTool('get_registration_status');
      return {
        language: lang,
        replyText: formatRegistrationReviewSummary(status.data.summary as Record<string, unknown>, lang),
      };
    }
  }

  // 10. General Page Navigation intents
  let navTarget: GatewayModule | 'back' | null = null;
  if (/\b(go back|previous page)\b/i.test(lower) || /(ተመለስ|duubatti deebi'i)/i.test(lower)) navTarget = 'back';
  else if (/\b(dashboard)\b/i.test(lower) || /(ዳሽቦርድ)/i.test(lower)) navTarget = 'dashboard';
  else if (/\b(employer|post job)\b/i.test(lower) || /(ቀጣሪ|hojjechiisaa)/i.test(lower)) navTarget = 'employer';
  else if (/\b(profile)\b/i.test(lower) || /(መገለጫ)/i.test(lower)) navTarget = 'profile';
  else if (/\b(home|homepage|home page|main page|start page)\b/i.test(lower) || /(መነሻ|fuula duraa)/i.test(lower)) navTarget = 'home';

  if (navTarget) {
    const res = await executeTool('navigate_to_page', { page: navTarget });
    const title = String(res.data.title || navTarget);
    const actions = (res.data.actions as string[]) || [];
    return {
      language: lang,
      replyText: localized(
        lang,
        `Confirmed: opened ${title}. Available actions: ${actions.slice(0, 3).join('; ')}.`,
        `ተረጋግጧል፦ ${title} ተከፍቷል።`,
        `Mirkanaa'eera: ${title} banameera.`
      ),
    };
  }

  // Fallback helpful site-wide orientation in user's exact language
  const spec = getOrientationSpec(activeModule, lang);
  return {
    language: lang,
    replyText: localized(
      lang,
      `You are on ${spec.title}. You can say "start registration", "find remote jobs", "show learning resources", "check my profile", "turn on dark mode", or "where am I".`,
      `እርስዎ አሁን "${spec.title}" ገጽ ላይ ነዎት። "ምዝገባ ጀምር"፣ "ስራ ፈልግ"፣ "ትምህርት አሳይ"፣ "የጨለማ ሁነታ ክፈት" ወይም "የት ነኝ" ማለት ይችላሉ።`,
      `Amma fuula "${spec.title}" irra jirtu. "Galmee jalqabi", "hojii barbaadi", "barnoota agarsiisi", "haala dukkanaa bani" ykn "eessa jira" jechuu dandeessu.`
    ),
  };
}
