import { SupportedLanguage } from '../types/gateway';

function collapseText(raw: string | null | undefined): string {
  return (raw || '').replace(/\s+/g, ' ').trim();
}

function localized(lang: SupportedLanguage, en: string, am: string, om: string): string {
  if (lang === 'am') return am;
  if (lang === 'om') return om;
  return en;
}

export function isSensitiveFormElement(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'password') return true;
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
    if (ac === 'current-password' || ac === 'new-password' || ac === 'one-time-code') {
      return true;
    }
  }
  if (el.getAttribute('data-sensitive') === 'true') return true;
  if (/password|passcode|pin|secret|token/i.test(el.id || '')) return true;
  return false;
}

function resolveDescribedByText(el: HTMLElement, excludeName: string): string {
  const describedBy = collapseText(el.getAttribute('aria-describedby'));
  if (!describedBy || typeof document === 'undefined') return '';
  const parts = describedBy
    .split(/\s+/)
    .map((id) => collapseText(document.getElementById(id)?.textContent))
    .filter((txt) => Boolean(txt) && txt !== excludeName);
  if (parts.length === 0) return '';
  return parts.join(' ').slice(0, 140);
}

function getRequirementSuffix(el: HTMLElement, lang: SupportedLanguage): string {
  const isRequired = el.hasAttribute('required') || el.getAttribute('aria-required') === 'true';
  if (isRequired) {
    return localized(lang, ' Required.', ' ግዴታ።', ' Dirqama.');
  }
  const isExplicitOptional =
    el.getAttribute('aria-required') === 'false' || el.getAttribute('data-optional') === 'true';
  if (isExplicitOptional) {
    return localized(lang, ' Optional.', ' አማራጭ።', ' Filannoo.');
  }
  return '';
}

function getDescriptionAndErrorSuffix(
  el: HTMLElement,
  name: string,
  lang: SupportedLanguage
): string {
  const isInvalid = el.getAttribute('aria-invalid') === 'true';
  const desc = resolveDescribedByText(el, name);
  if (isInvalid && desc) {
    return localized(
      lang,
      ` Error: ${desc}`,
      ` ስህተት፡ ${desc}`,
      ` Dogoggora: ${desc}`
    );
  }
  if (isInvalid) {
    return localized(
      lang,
      ' Invalid input.',
      ' ትክክለኛ ያልሆነ ግቤት።',
      ' Galtee sirrii hin taane.'
    );
  }
  if (desc) {
    return ` ${desc}`;
  }
  return '';
}

export function resolveAccessibleElementName(el: HTMLElement): string {
  const ariaLabel = collapseText(el.getAttribute('aria-label'));
  if (ariaLabel) return ariaLabel.slice(0, 90);

  const labelledBy = collapseText(el.getAttribute('aria-labelledby'));
  if (labelledBy && typeof document !== 'undefined') {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => collapseText(document.getElementById(id)?.textContent))
      .filter(Boolean);
    if (parts.length > 0) return parts.join(' ').slice(0, 90);
  }

  if (el.id && typeof document !== 'undefined') {
    try {
      const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(el.id) : el.id;
      const assocLabel = document.querySelector(`label[for="${escapedId}"]`);
      const labelText = collapseText(assocLabel?.textContent);
      if (labelText) return labelText.slice(0, 90);
    } catch {
      // Ignore invalid selector characters
    }
  }

  const wrappingLabel = el.closest('label');
  if (wrappingLabel) {
    const clone = wrappingLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input, select, textarea, button, .gw-sr-only').forEach((n) => n.remove());
    const wrappedText = collapseText(clone.textContent);
    if (wrappedText) return wrappedText.slice(0, 90);
  }

  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    const placeholder = collapseText(el.getAttribute('placeholder'));
    if (placeholder) return placeholder.slice(0, 90);
  }

  const titleAttr = collapseText(el.getAttribute('title'));
  if (titleAttr) return titleAttr.slice(0, 90);

  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  const visibleText = collapseText(clone.textContent);
  return visibleText.slice(0, 90);
}

export function describeFocusedElement(el: HTMLElement | null, lang: SupportedLanguage): string {
  if (!el || el === document.body || el === document.documentElement) return '';
  if (el.tagName === 'MAIN' && el.getAttribute('tabindex') === '-1') return '';

  const name = resolveAccessibleElementName(el);
  if (!name) return '';

  const tag = el.tagName.toLowerCase();
  const role = (el.getAttribute('role') || '').toLowerCase();
  const isInsideNav = Boolean(el.closest('nav'));
  const isCurrentPage = el.getAttribute('aria-current') === 'page';
  const isDisabled = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';

  if (isDisabled) {
    return localized(
      lang,
      `${name}. Disabled control.`,
      `${name}። የማይሰራ ቁልፍ።`,
      `${name}. To'annoo hojii ala ta'e.`
    );
  }

  // 1. Password / Sensitive inputs — NEVER read value or sensitive hints
  if (isSensitiveFormElement(el)) {
    const reqSuffix = getRequirementSuffix(el, lang);
    return localized(
      lang,
      `${name}. Password input field. Text is hidden for privacy. You can enter your password.${reqSuffix}`,
      `${name}። የይለፍ ቃል መጻፊያ ሳጥን። ለግላዊነት ጽሑፉ ተደብቋል።${reqSuffix}`,
      `${name}. Iddoo jecha iccitii. Nageenyaaf barreeffamni dhokfamera.${reqSuffix}`
    );
  }

  // 2. Explicit ARIA Menu Items
  if (role === 'menuitem' || role === 'menuitemcheckbox' || role === 'menuitemradio') {
    return localized(
      lang,
      `${name}. Menu item. Press Enter to select.`,
      `${name}። የምናሌ ምርጫ። ለመምረጥ Enterን ይጫኑ።`,
      `${name}. Filannoo baafataa. Filachuuf Enter tuqaa.`
    );
  }

  // 3. Links or Navigation controls inside <nav>
  if (tag === 'a' || role === 'link' || (isInsideNav && tag === 'button')) {
    const currentSuffix = isCurrentPage
      ? localized(lang, ' Current page.', ' የአሁኑ ገጽ።', ' Fuula ammaa.')
      : '';
    return localized(
      lang,
      `${name}. Navigation link. Press Enter to open.${currentSuffix}`,
      `${name}። የአሰሳ አገናኝ። ለመክፈት Enterን ይጫኑ።${currentSuffix}`,
      `${name}. Geessituu fuulaa. Banuuf Enter tuqaa.${currentSuffix}`
    );
  }

  // 4. Text / Search / Email / Tel / URL inputs & Textareas
  if (
    tag === 'textarea' ||
    (el instanceof HTMLInputElement &&
      !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(el.type))
  ) {
    const reqSuffix = getRequirementSuffix(el, lang);
    const extraSuffix = getDescriptionAndErrorSuffix(el, name, lang);
    const isSearch =
      el instanceof HTMLInputElement &&
      (el.type === 'search' || /search|ፍለጋ|barbaadi/i.test(el.id + ' ' + name));
    if (isSearch) {
      return (
        localized(
          lang,
          `${name}. Input field. You can enter your search.`,
          `${name}። የፍለጋ ሳጥን። የሚፈልጉትን መጻፍ ይችላሉ።`,
          `${name}. Iddoo barbaachaa. Waan barbaaddan barreessuu dandeessu.`
        ) +
        reqSuffix +
        extraSuffix
      );
    }
    if (el instanceof HTMLInputElement && el.type === 'email') {
      return (
        localized(
          lang,
          `${name}. Email input field. You can enter your email address.`,
          `${name}። የኢሜይል ማስገቢያ ሳጥን። ኢሜይልዎን መጻፍ ይችላሉ።`,
          `${name}. Iddoo imeelii. Imeelii keessan galchuu dandeessu.`
        ) +
        reqSuffix +
        extraSuffix
      );
    }
    if (el instanceof HTMLInputElement && el.type === 'tel') {
      return (
        localized(
          lang,
          `${name}. Phone input field. You can enter your phone number.`,
          `${name}። የስልክ ቁጥር ማስገቢያ ሳጥን። ስልክ ቁጥርዎን መጻፍ ይችላሉ።`,
          `${name}. Iddoo bilbilaa. Lakkoofsa bilbilaa keessan galchuu dandeessu.`
        ) +
        reqSuffix +
        extraSuffix
      );
    }
    return (
      localized(
        lang,
        `${name}. Input field. You can enter your text.`,
        `${name}። የጽሑፍ ማስገቢያ ሳጥን። መልስዎን መጻፍ ይችላሉ።`,
        `${name}. Iddoo galtee. Barreeffama keessan galchuu dandeessu.`
      ) +
      reqSuffix +
      extraSuffix
    );
  }

  // 5. Dropdown Select
  if (el instanceof HTMLSelectElement || role === 'combobox' || role === 'listbox') {
    const selectedOption =
      el instanceof HTMLSelectElement && el.selectedIndex >= 0
        ? collapseText(el.options[el.selectedIndex]?.text)
        : '';
    const optSuffix = selectedOption ? `, ${selectedOption}` : '';
    const reqSuffix = getRequirementSuffix(el, lang);
    return (
      localized(
        lang,
        `${name}. Dropdown selector${optSuffix}. Use arrow keys to choose.`,
        `${name}። ተቆልቋይ መምረጫ${optSuffix}። ለመምረጥ የቀስት ቁልፎችን ይጠቀሙ።`,
        `${name}. Filannoo tarree${optSuffix}. Filachuuf furtuu xiyyaa fayyadamaa.`
      ) + reqSuffix
    );
  }

  // 6. Checkboxes, Radios, Switches
  if (
    (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) ||
    role === 'checkbox' ||
    role === 'radio' ||
    role === 'switch'
  ) {
    const isRadio =
      (el instanceof HTMLInputElement && el.type === 'radio') || role === 'radio';
    const isChecked =
      el instanceof HTMLInputElement
        ? el.checked
        : el.getAttribute('aria-checked') === 'true';
    const reqSuffix = getRequirementSuffix(el, lang);

    if (isRadio) {
      return (
        localized(
          lang,
          `${name}. Radio button, ${isChecked ? 'selected' : 'not selected'}. Press Space to select.`,
          `${name}። የምርጫ አዝራር፣ ${isChecked ? 'ተመርጧል' : 'አልተመረጠም'}። ለመምረጥ Spaceን ይጫኑ።`,
          `${name}. Qabduu filannoo, ${isChecked ? 'filatameera' : 'hin filatamne'}. Filachuuf Space tuqaa.`
        ) + reqSuffix
      );
    }
    return (
      localized(
        lang,
        `${name}. Checkbox, ${isChecked ? 'checked' : 'not checked'}. Press Space to ${
          isChecked ? 'uncheck' : 'check'
        }.`,
        `${name}። ማረጋገጫ ሳጥን፣ ${isChecked ? 'ተመርጧል' : 'አልተመረጠም'}። ለመቀየር Spaceን ይጫኑ።`,
        `${name}. Saanduqa filannoo, ${isChecked ? 'filatameera' : 'hin filatamne'}. Jijjiiruuf Space tuqaa.`
      ) + reqSuffix
    );
  }

  // 7. Submit buttons, Toggle Buttons, Tabs, Standard Action Buttons
  if (
    tag === 'button' ||
    role === 'button' ||
    role === 'tab' ||
    tag === 'summary' ||
    (el instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(el.type))
  ) {
    const pressedAttr = el.getAttribute('aria-pressed');
    if (pressedAttr === 'true' || pressedAttr === 'false') {
      const pressed = pressedAttr === 'true';
      return localized(
        lang,
        `${name} button, ${pressed ? 'pressed' : 'not pressed'}. Press Enter to toggle.`,
        `${name} አዝራር፣ ${pressed ? 'በርቷል' : 'ጠፍቷል'}። ለመቀየር Enterን ይጫኑ።`,
        `Qabduu ${name}, ${pressed ? 'banamaa' : 'cufamaa'}. Jijjiiruuf Enter tuqaa.`
      );
    }

    const expandedAttr = el.getAttribute('aria-expanded');
    if (expandedAttr === 'true' || expandedAttr === 'false') {
      const expanded = expandedAttr === 'true';
      return localized(
        lang,
        `${name} button, ${expanded ? 'expanded' : 'collapsed'}. Press Enter to toggle.`,
        `${name} አዝራር፣ ${expanded ? 'ተከፍቷል' : 'ተዘግቷል'}። ለመቀየር Enterን ይጫኑ።`,
        `Qabduu ${name}, ${expanded ? 'banameera' : 'cufameera'}. Jijjiiruuf Enter tuqaa.`
      );
    }

    const isSubmit =
      (el instanceof HTMLButtonElement && el.type === 'submit') ||
      (el instanceof HTMLInputElement && el.type === 'submit');
    if (isSubmit) {
      return localized(
        lang,
        `${name} submit button. Press Enter to submit.`,
        `${name} መላኪያ አዝራር። ለመላክ Enterን ይጫኑ።`,
        `Qabduu ergaa ${name}. Erguuf Enter tuqaa.`
      );
    }

    return localized(
      lang,
      `${name} button. Press Enter to open.`,
      `${name} አዝራር። ለመክፈት Enterን ይጫኑ።`,
      `Qabduu ${name}. Banuuf Enter tuqaa.`
    );
  }

  return name;
}

export function formatPageArrivalAnnouncement(
  pageTitle: string,
  lang: SupportedLanguage
): string {
  return localized(
    lang,
    `You are now on the ${pageTitle} page.`,
    `አሁን በ${pageTitle} ገጽ ላይ ነዎት።`,
    `Amma fuula ${pageTitle} irra jirtu.`
  );
}

export function formatValidationAlertAnnouncement(
  rawMessage: string,
  lang: SupportedLanguage
): string {
  const clean = collapseText(rawMessage).slice(0, 180);
  if (!clean) return '';
  return localized(
    lang,
    `Validation error. ${clean}`,
    `የማረጋገጫ ስህተት። ${clean}`,
    `Dogoggora mirkaneessaa. ${clean}`
  );
}

export function formatSubmissionResultAnnouncement(
  rawMessage: string,
  lang: SupportedLanguage
): string {
  const clean = collapseText(rawMessage).slice(0, 180);
  if (!clean) return '';
  return localized(
    lang,
    `Submitted. ${clean}`,
    `ተልኳል። ${clean}`,
    `Ergameera. ${clean}`
  );
}
