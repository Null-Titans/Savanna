import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, FileUp, Lock, ShieldCheck } from 'lucide-react';
import { useI18n } from '../../i18n';
import {
  FormBuilderQuestion,
  FormVersionRecord,
  LocalizedText,
  SupportedLanguage,
  UploadedFileMeta,
} from '../../types/gateway';
import { userApi } from '../../services/api/userApi';
import { normalizeEthiopianPhone } from '../../utils/coreHelpers.mjs';
import { ReadAloudButton } from '../accessibility/ReadAloudButton';

interface DynamicPublishedFormRunnerProps {
  formId: string;
  onBackToGateway: () => void;
}

type PublishedFormSchema = FormVersionRecord['schemaSnapshot'] & {
  versionId: string;
  versionNumber: number;
};

function pickText(text: LocalizedText | undefined, lang: SupportedLanguage): string {
  if (!text) return '';
  return text[lang] || text.en || text.am || text.om || '';
}

export function evaluateCondition(
  q: FormBuilderQuestion,
  answers: Record<string, unknown>
): boolean {
  if (!q.conditionalLogic || !q.conditionalLogic.dependsOnKey) return true;
  const targetVal = answers[q.conditionalLogic.dependsOnKey];
  const expected = q.conditionalLogic.value ?? '';

  switch (q.conditionalLogic.operator) {
    case 'is_truthy':
      return Array.isArray(targetVal)
        ? targetVal.length > 0
        : Boolean(targetVal && String(targetVal).trim() !== '');
    case 'equals':
      return String(targetVal ?? '').toLowerCase() === expected.toLowerCase();
    case 'not_equals':
      return String(targetVal ?? '').toLowerCase() !== expected.toLowerCase();
    case 'contains':
      return Array.isArray(targetVal)
        ? targetVal.includes(expected)
        : String(targetVal ?? '').toLowerCase().includes(expected.toLowerCase());
    default:
      return true;
  }
}

export const DynamicPublishedFormRunner: React.FC<DynamicPublishedFormRunnerProps> = ({
  formId,
  onBackToGateway,
}) => {
  const { language, t } = useI18n();
  const [schema, setSchema] = useState<PublishedFormSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, UploadedFileMeta>>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<{ id: string; submittedAt: string } | null>(null);

  const loadForm = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await userApi.getPublicForm(formId);
      setSchema(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load form.');
    } finally {
      setLoading(false);
    }
  }, [formId]);

  useEffect(() => {
    void loadForm();
  }, [loadForm]);

  const visibleQuestions = useMemo(() => {
    if (!schema) return [];
    return schema.questions
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((q) => evaluateCondition(q, answers));
  }, [answers, schema]);

  const setAnswer = (fieldKey: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [fieldKey]: value }));
    if (fieldErrors[fieldKey]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[fieldKey];
        return next;
      });
    }
  };

  const handleFileChange = async (q: FormBuilderQuestion, file: File | null) => {
    if (!file || !schema) return;
    setUploadingKey(q.fieldKey);
    setSubmitError(null);
    try {
      const uploaded = await userApi.uploadFile(file, {
        organizationId: schema.organizationId,
        purpose: 'form_attachment',
      });
      setUploadedFiles((prev) => ({ ...prev, [q.fieldKey]: uploaded }));
      setAnswer(q.fieldKey, uploaded.id);
    } catch (err) {
      setFieldErrors((prev) => ({
        ...prev,
        [q.fieldKey]: err instanceof Error ? err.message : 'File upload failed.',
      }));
    } finally {
      setUploadingKey(null);
    }
  };

  const validateAll = (): boolean => {
    const errors: Record<string, string> = {};
    for (const q of visibleQuestions) {
      const label = pickText(q.label, language);
      const val = answers[q.fieldKey];

      if (q.questionType === 'consent') {
        if (q.required && val !== true) {
          errors[q.fieldKey] = t.onboarding.errors.emptyPartnerConsent;
        }
        continue;
      }

      if (q.questionType === 'checkbox') {
        const arr = Array.isArray(val) ? val : [];
        if (q.required && arr.length === 0) {
          errors[q.fieldKey] = `${label} requires at least one choice.`;
        }
        continue;
      }

      if (q.questionType === 'address') {
        const addr = (val as { street?: string; city?: string; region?: string }) || {};
        if (q.required && (!addr.city?.trim() || !addr.street?.trim())) {
          errors[q.fieldKey] = `${label}: street and city are required.`;
        }
        continue;
      }

      const str = typeof val === 'string' || typeof val === 'number' ? String(val).trim() : '';
      if (q.required && !str) {
        errors[q.fieldKey] = `${label} is required.`;
        continue;
      }
      if (str) {
        if (q.questionType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) {
          errors[q.fieldKey] = 'Please enter a valid email address.';
        }
        if (q.questionType === 'phone') {
          const norm = normalizeEthiopianPhone(str);
          if (!norm && !/^\+?\d{7,15}$/.test(str.replace(/[\s-]/g, ''))) {
            errors[q.fieldKey] = t.onboarding.errors.invalidEthiopianPhone;
          }
        }
        if (q.questionType === 'number') {
          const num = Number(str);
          if (Number.isNaN(num)) {
            errors[q.fieldKey] = 'Please enter a valid number.';
          } else {
            if (typeof q.validation?.min === 'number' && num < q.validation.min) {
              errors[q.fieldKey] = `Must be at least ${q.validation.min}.`;
            }
            if (typeof q.validation?.max === 'number' && num > q.validation.max) {
              errors[q.fieldKey] = `Must be at most ${q.validation.max}.`;
            }
          }
        }
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schema) return;
    setSubmitError(null);
    if (!validateAll()) return;

    setIsSubmitting(true);
    try {
      const payloadAnswers: Record<string, unknown> = {};
      for (const q of visibleQuestions) {
        if (answers[q.fieldKey] !== undefined) {
          payloadAnswers[q.fieldKey] = answers[q.fieldKey];
        }
      }
      const res = await userApi.submitPublicForm(schema.id, {
        answers: payloadAnswers,
        language,
      });
      setReceipt({ id: res.id, submittedAt: res.submittedAt });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to submit form.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div role="status" className="max-w-3xl mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        {t.common.loadingStatus}
      </div>
    );
  }

  if (loadError || !schema) {
    return (
      <div role="alert" className="max-w-3xl mx-auto rounded-2xl border-2 border-red-700 bg-red-50 dark:bg-red-950/50 p-6 space-y-4">
        <p className="font-semibold text-red-900 dark:text-red-100">
          {loadError || 'Published form not found.'}
        </p>
        <button
          type="button"
          onClick={onBackToGateway}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-lg bg-[#0F1E36] text-white text-sm font-semibold cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>{t.formBuilder.backToGateway}</span>
        </button>
      </div>
    );
  }

  const formTitle = pickText(schema.title, language);
  const formDesc = pickText(schema.description, language);

  if (receipt) {
    return (
      <section className="max-w-3xl mx-auto rounded-2xl border-2 border-emerald-700 dark:border-emerald-500 bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-7 h-7 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-bold text-[#0F1E36] dark:text-white">{formTitle}</h1>
            <p className="text-xs font-mono text-slate-600 dark:text-slate-400 tabular-nums mt-1">
              Submission ID: {receipt.id} · v{schema.versionNumber}
            </p>
          </div>
        </div>
        <p className="text-base text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
          {pickText(schema.doneMessage, language) || t.onboarding.confirmationRealNote}
        </p>
        <button
          type="button"
          onClick={onBackToGateway}
          className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-lg bg-[#0F1E36] dark:bg-amber-500 text-white dark:text-[#0F1E36] text-sm font-bold cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>{t.formBuilder.backToGateway}</span>
        </button>
      </section>
    );
  }

  const sections = schema.sections.slice().sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <button
        type="button"
        onClick={onBackToGateway}
        className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-[#0F1E36] dark:text-slate-100 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        <span>{t.formBuilder.backToGateway}</span>
      </button>

      <header
        className="rounded-2xl bg-[#0F1E36] text-white p-6 sm:p-8 space-y-3"
        style={{ backgroundColor: schema.branding?.primaryColor || 'var(--gw-primary)' }}
      >
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
          <ShieldCheck className="w-4 h-4" aria-hidden="true" />
          <span>{schema.branding?.logoText || 'Savanna Gateway'} · v{schema.versionNumber}</span>
        </p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">{formTitle}</h1>
        {formDesc && <p className="text-sm sm:text-base text-slate-200">{formDesc}</p>}
        <ReadAloudButton textToRead={`${formTitle}. ${formDesc}`} />
      </header>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {sections.map((section) => {
          const secQuestions = visibleQuestions.filter((q) => q.sectionId === section.id);
          if (secQuestions.length === 0) return null;

          return (
            <section
              key={section.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
            >
              <div className="border-b border-slate-200 dark:border-slate-800 pb-3 space-y-1">
                <h2 className="text-lg font-bold text-[#0F1E36] dark:text-white">
                  {pickText(section.title, language)}
                </h2>
                {pickText(section.description, language) && (
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                    {pickText(section.description, language)}
                  </p>
                )}
              </div>

              <div className="space-y-5">
                {secQuestions.map((q) => {
                  const inputId = `pub-q-${q.fieldKey}`;
                  const label = pickText(q.label, language);
                  const help = pickText(q.helpText, language);
                  const why = pickText(q.whyWeAsk, language);
                  const err = fieldErrors[q.fieldKey];
                  const val = answers[q.fieldKey];

                  return (
                    <div key={q.id} className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label
                          htmlFor={inputId}
                          className="text-sm font-semibold text-[#0F1E36] dark:text-white"
                        >
                          {label}{' '}
                          {q.required ? (
                            <span className="text-red-700 dark:text-red-400">*</span>
                          ) : (
                            <span className="text-xs font-normal text-slate-500">
                              ({t.common.optionalBadge})
                            </span>
                          )}
                        </label>
                        {q.sensitive && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Private</span>
                          </span>
                        )}
                      </div>

                      {help && (
                        <p className="text-xs text-slate-600 dark:text-slate-400">{help}</p>
                      )}

                      {/* Render per all 12 Question Types */}
                      {(q.questionType === 'text' ||
                        q.questionType === 'email' ||
                        q.questionType === 'phone' ||
                        q.questionType === 'number' ||
                        q.questionType === 'date') && (
                        <input
                          id={inputId}
                          type={
                            q.questionType === 'phone'
                              ? 'tel'
                              : q.questionType === 'number'
                              ? 'number'
                              : q.questionType
                          }
                          required={q.required}
                          value={typeof val === 'string' || typeof val === 'number' ? String(val) : ''}
                          onChange={(e) => setAnswer(q.fieldKey, e.target.value)}
                          placeholder={pickText(q.placeholder, language)}
                          aria-invalid={Boolean(err)}
                          className="w-full min-h-[46px] rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3.5 py-2 text-base text-[#0F1E36] dark:text-white"
                        />
                      )}

                      {q.questionType === 'dropdown' && (
                        <select
                          id={inputId}
                          required={q.required}
                          value={typeof val === 'string' ? val : ''}
                          onChange={(e) => setAnswer(q.fieldKey, e.target.value)}
                          aria-invalid={Boolean(err)}
                          className="w-full min-h-[46px] rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3.5 py-2 text-base text-[#0F1E36] dark:text-white"
                        >
                          <option value="">-- Select --</option>
                          {q.options.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {pickText(opt.label, language)}
                            </option>
                          ))}
                        </select>
                      )}

                      {(q.questionType === 'radio' || q.questionType === 'yes_no') && (
                        <div className="space-y-2">
                          {(q.questionType === 'yes_no'
                            ? [
                                { value: 'yes', label: { en: 'Yes', am: 'አዎ', om: 'Eeyyee' } },
                                { value: 'no', label: { en: 'No', am: 'አይ', om: 'Lakki' } },
                              ]
                            : q.options
                          ).map((opt) => (
                            <label
                              key={opt.value}
                              className="flex items-center gap-3 min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/50 dark:bg-slate-800/60 cursor-pointer"
                            >
                              <input
                                type="radio"
                                name={inputId}
                                checked={val === opt.value}
                                onChange={() => setAnswer(q.fieldKey, opt.value)}
                                className="h-4 w-4 accent-[#0F1E36]"
                              />
                              <span className="text-sm font-medium text-[#0F1E36] dark:text-white">
                                {pickText(opt.label, language)}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}

                      {q.questionType === 'checkbox' && (
                        <div className="space-y-2">
                          {q.options.map((opt) => {
                            const selectedList = Array.isArray(val) ? (val as string[]) : [];
                            const checked = selectedList.includes(opt.value);
                            return (
                              <label
                                key={opt.value}
                                className="flex items-center gap-3 min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/50 dark:bg-slate-800/60 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = e.target.checked
                                      ? [...selectedList, opt.value]
                                      : selectedList.filter((item) => item !== opt.value);
                                    setAnswer(q.fieldKey, next);
                                  }}
                                  className="h-4 w-4 accent-[#0F1E36]"
                                />
                                <span className="text-sm font-medium text-[#0F1E36] dark:text-white">
                                  {pickText(opt.label, language)}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {q.questionType === 'address' && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <input
                            id={inputId}
                            type="text"
                            placeholder="Street / Sub-city"
                            value={((val as Record<string, string>) || {}).street || ''}
                            onChange={(e) =>
                              setAnswer(q.fieldKey, {
                                ...((val as Record<string, string>) || {}),
                                street: e.target.value,
                              })
                            }
                            className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3 text-sm"
                          />
                          <input
                            type="text"
                            placeholder="City"
                            value={((val as Record<string, string>) || {}).city || ''}
                            onChange={(e) =>
                              setAnswer(q.fieldKey, {
                                ...((val as Record<string, string>) || {}),
                                city: e.target.value,
                              })
                            }
                            className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3 text-sm"
                          />
                          <input
                            type="text"
                            placeholder="Region / Country"
                            value={((val as Record<string, string>) || {}).region || ''}
                            onChange={(e) =>
                              setAnswer(q.fieldKey, {
                                ...((val as Record<string, string>) || {}),
                                region: e.target.value,
                              })
                            }
                            className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3 text-sm"
                          />
                        </div>
                      )}

                      {q.questionType === 'file' && (
                        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 space-y-2">
                          <label
                            htmlFor={inputId}
                            className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-[#0F1E36] dark:text-white cursor-pointer"
                          >
                            <FileUp className="w-4 h-4" aria-hidden="true" />
                            <span>
                              {uploadingKey === q.fieldKey
                                ? 'Uploading...'
                                : uploadedFiles[q.fieldKey]
                                ? `Uploaded: ${uploadedFiles[q.fieldKey].originalName}`
                                : 'Choose PDF, DOC, TXT, or Image (max 5 MB)'}
                            </span>
                            <input
                              id={inputId}
                              type="file"
                              className="sr-only"
                              onChange={(e) =>
                                void handleFileChange(q, e.target.files?.[0] || null)
                              }
                            />
                          </label>
                        </div>
                      )}

                      {q.questionType === 'consent' && (
                        <label className="flex items-start gap-3 min-h-[48px] p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/50 dark:bg-slate-800/60 cursor-pointer">
                          <input
                            id={inputId}
                            type="checkbox"
                            checked={val === true}
                            onChange={(e) => setAnswer(q.fieldKey, e.target.checked)}
                            className="mt-1 h-4 w-4 accent-[#0F1E36]"
                          />
                          <span className="text-sm font-medium text-[#0F1E36] dark:text-slate-100">
                            {help || label}
                          </span>
                        </label>
                      )}

                      {why && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          <strong>{t.common.whyWeAskLabel}:</strong> {why}
                        </p>
                      )}

                      {err && (
                        <p role="alert" className="text-xs font-semibold text-red-700 dark:text-red-300">
                          {err}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {submitError && (
          <div role="alert" className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/60 p-4 text-sm text-red-900 dark:text-red-100">
            {submitError}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="min-h-[48px] px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#0F1E36] text-base font-bold cursor-pointer disabled:opacity-60"
        >
          {isSubmitting ? t.common.loadingStatus : pickText(schema.submitLabel, language) || t.common.submit}
        </button>
      </form>
    </div>
  );
};
