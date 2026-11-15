import { SupportedLanguage } from '../types/gateway';

const GOODBYE_EXACT_REGEX =
  /^(goodbye|good bye|bye|bye bye|stop listening|end conversation|close assistant|close voice assistant|exit assistant|turn off mic|ደህና\s*ሁኑ|ደህና\s*ሁን|ቻው|ማዳመጥ\s*አቁም|ውይይቱን\s*ዝጋ|nagaatti|dhaggeeffachuu\s*dhaabi|haasawa\s*cufi)[.!?\s]*$/i;

const GOODBYE_PHRASE_REGEX =
  /\b(goodbye|good bye|stop listening|end conversation|close assistant|close voice assistant|exit assistant|turn off mic)\b|(?:ማዳመጥ\s*አቁም|ውይይቱን\s*ዝጋ|ደህና\s*ሁኑ|dhaggeeffachuu\s*dhaabi|haasawa\s*cufi|nagaatti)/i;

export function isGoodbyeCommand(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return GOODBYE_EXACT_REGEX.test(trimmed) || GOODBYE_PHRASE_REGEX.test(trimmed);
}

export function getLiveListeningGreeting(lang: SupportedLanguage): string {
  if (lang === 'am') {
    return 'ሰላም! እያዳመጥኩ ነው። እንዴት ልርዳዎት እችላለሁ?';
  }
  if (lang === 'om') {
    return "Akkam! Dhaggeeffachaa jira. Akkamitti isin gargaaruu danda'a?";
  }
  return "Hello! I'm listening. How can I help you?";
}
