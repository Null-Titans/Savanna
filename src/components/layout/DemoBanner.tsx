import React, { useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Globe,
  Info,
  Mic,
  Moon,
  SlidersHorizontal,
  Sun,
  X,
} from "lucide-react";
import { useI18n } from "../../i18n";
import { LANGUAGE_REGISTRY } from "../../i18n/types";
import { SupportedLanguage } from "../../types/gateway";
import type { ColorMode } from "../../app/GatewayShell";
import type { UseVoiceTriggerResult } from "../../hooks/useVoiceTrigger";
import {
  resolveVoiceTriggerErrorMessage,
  VoiceTriggerToggle,
} from "../accessibility/VoiceTriggerToggle";

interface DemoBannerProps {
  apiMode: "mock" | "real";
  colorMode: ColorMode;
  onToggleColorMode: () => void;
  easyRead: boolean;
  onToggleEasyRead: () => void;
  onOpenThemeDrawer: () => void;
  onOpenVoiceAssistant?: () => void;
  voiceTrigger?: UseVoiceTriggerResult;
  wakePhrase?: string;
}

export const DemoBanner: React.FC<DemoBannerProps> = ({
  apiMode,
  colorMode,
  onToggleColorMode,
  easyRead,
  onToggleEasyRead,
  onOpenThemeDrawer,
  onOpenVoiceAssistant,
  voiceTrigger,
  wakePhrase = "Hey Access",
}) => {
  const { language, t, setLanguage } = useI18n();
  const isDark = colorMode === "dark";
  const [unsupportedNotice, setUnsupportedNotice] = useState<string | null>(
    null,
  );

  const activeTriggerError = voiceTrigger
    ? resolveVoiceTriggerErrorMessage(
        voiceTrigger.errorCode,
        voiceTrigger.error,
        t.voiceTrigger,
      ) || unsupportedNotice
    : unsupportedNotice;

  return (
    <div className="w-full min-w-0 max-w-full border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[#0F1E36] dark:text-slate-100 transition-colors">
      <div className="gw-container w-full min-w-0 max-w-full py-3 px-3 sm:px-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 text-xs sm:text-sm">
        {/* Connection status and display mode */}
        <div className="flex items-start sm:items-center gap-2 min-w-0 w-full lg:w-auto">
          <button
            type="button"
            onClick={onToggleColorMode}
            aria-pressed={isDark}
            aria-label={
              isDark ? t.common.lightModeLabel : t.common.darkModeLabel
            }
            title={isDark ? t.common.lightModeLabel : t.common.darkModeLabel}
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-1.5 rounded-lg bg-transparent border-0 text-[#0F1E36] dark:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
          >
            {isDark ? (
              <Sun className="w-5 h-5 text-amber-400" aria-hidden="true" />
            ) : (
              <Moon className="w-5 h-5 text-[#1E3A5F]" aria-hidden="true" />
            )}
          </button>

          <div className="flex items-start sm:items-center gap-2 min-w-0 flex-1">
            <Info
              className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0 text-[#1E3A5F] dark:text-amber-400"
              aria-hidden="true"
            />
            <p className="min-w-0 break-words text-slate-700 dark:text-slate-300 leading-snug">
              <strong className="font-semibold text-[#0F1E36] dark:text-white">
                {apiMode === "mock"
                  ? t.common.demoBannerTitle
                  : t.common.realApiLabel}
                :
              </strong>{" "}
              <span>{t.common.demoBannerBody}</span>
            </p>
          </div>
        </div>

        {/* Responsive toolbar controls */}
        <div className="w-full min-w-0 lg:w-auto lg:flex-1 lg:justify-end flex flex-wrap items-center justify-start lg:justify-end gap-2">
          {/* Language selector */}
          <div className="flex items-center gap-1.5 min-h-[44px] max-w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-slate-50 dark:bg-slate-800 px-2.5 text-[#0F1E36] dark:text-white shadow-xs hover:border-slate-400 dark:hover:border-amber-400 transition-colors dark:[color-scheme:dark]">
            <Globe
              className="w-4 h-4 shrink-0 text-[#1E3A5F] dark:text-amber-400"
              aria-hidden="true"
            />
            <label htmlFor="gw-language-select" className="gw-sr-only">
              {t.common.languageLabel}
            </label>
            <select
              id="gw-language-select"
              value={language}
              onChange={(e) =>
                void setLanguage(e.target.value as SupportedLanguage)
              }
              className="min-h-[40px] min-w-0 max-w-full bg-transparent dark:bg-slate-800 pe-1 text-xs sm:text-sm font-semibold text-[#0F1E36] dark:text-white dark:[color-scheme:dark] cursor-pointer"
            >
              {LANGUAGE_REGISTRY.map((lang) => (
                <option
                  key={lang.code}
                  value={lang.code}
                  className="bg-white text-[#0F1E36] dark:bg-slate-900 dark:text-white"
                >
                  {lang.nativeName} ({lang.code.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* Voice assistant */}
          {onOpenVoiceAssistant && (
            <button
              type="button"
              onClick={onOpenVoiceAssistant}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] max-w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold text-[#0F1E36] dark:text-slate-100 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-400 dark:hover:border-slate-500 transition-colors cursor-pointer"
            >
              <Mic
                className="w-4 h-4 shrink-0 text-[#1E3A5F] dark:text-amber-400"
                aria-hidden="true"
              />
              <span>{t.voiceAssistant.openButton}</span>
            </button>
          )}

          {/* Wake microphone */}
          {voiceTrigger && (
            <div className="max-w-full min-w-0">
              <VoiceTriggerToggle
                status={voiceTrigger.status}
                isListening={voiceTrigger.isListening}
                isSupported={voiceTrigger.isSupported}
                hasPermission={voiceTrigger.hasPermission}
                isPaused={voiceTrigger.isPaused}
                isSecureContext={voiceTrigger.isSecureContext}
                wakePhrase={wakePhrase}
                triggerCount={voiceTrigger.triggerCount}
                error={voiceTrigger.error}
                errorCode={voiceTrigger.errorCode}
                onToggle={() => {
                  setUnsupportedNotice(null);
                  voiceTrigger.toggleListening();
                }}
                onClearError={voiceTrigger.clearError}
                onUnsupportedActivate={(reason) => setUnsupportedNotice(reason)}
                hideInlineAlert
              />
            </div>
          )}

          {/* Simple view */}
          <button
            type="button"
            onClick={onToggleEasyRead}
            aria-pressed={easyRead}
            className={`inline-flex items-center justify-center gap-2 min-h-[44px] max-w-full px-3.5 py-2 rounded-lg border text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer ${
              easyRead
                ? "border-[#0F1E36] bg-[#0F1E36] text-white dark:border-amber-400 dark:bg-amber-500 dark:text-[#0F1E36]"
                : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#0F1E36] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-400 dark:hover:border-slate-500"
            }`}
          >
            <BookOpen
              className={`w-4 h-4 shrink-0 ${
                easyRead
                  ? "text-amber-400 dark:text-[#0F1E36]"
                  : "text-[#1E3A5F] dark:text-amber-400"
              }`}
              aria-hidden="true"
            />
            <span>{easyRead ? t.common.easyReadOn : t.common.easyReadOff}</span>
          </button>

          {/* Partner theme and API settings */}
          <button
            type="button"
            onClick={onOpenThemeDrawer}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] max-w-full px-3.5 py-2 rounded-lg border border-[#0F1E36]/20 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm font-semibold text-[#0F1E36] dark:text-slate-100 shadow-xs hover:bg-[#0F1E36] hover:text-white dark:hover:bg-slate-700 hover:border-[#0F1E36] dark:hover:border-slate-500 transition-colors cursor-pointer group"
          >
            <SlidersHorizontal
              className="w-4 h-4 shrink-0 text-[#1E3A5F] dark:text-amber-400 group-hover:text-amber-400 transition-colors"
              aria-hidden="true"
            />
            <span>{t.nav.themeSettings}</span>
          </button>
        </div>
      </div>

      {/* Wake microphone error */}
      {activeTriggerError && (
        <div
          role="alert"
          className="border-t border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/80 text-red-900 dark:text-red-100"
        >
          <div className="gw-container w-full min-w-0 py-1.5 px-3 sm:px-4 flex items-center justify-between gap-3 text-xs sm:text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle
                className="w-4 h-4 shrink-0 text-red-700 dark:text-red-300"
                aria-hidden="true"
              />
              <span className="min-w-0 break-words">{activeTriggerError}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setUnsupportedNotice(null);
                voiceTrigger?.clearError();
              }}
              aria-label={t.voiceTrigger.dismissError}
              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-red-800 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
