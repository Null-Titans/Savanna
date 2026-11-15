import React, { useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, Code2, Cpu, Database, Headphones, Layers } from 'lucide-react';
import { useI18n } from '../../i18n';
import { GatewayModule } from '../../types/gateway';
import { LEARNING_TRACKS, LearningTrack } from '../../data/learningTracks';
import { ReadAloudButton } from '../accessibility/ReadAloudButton';
import { useWebsiteAgent } from '../../context/WebsiteAgentContext';

interface LearningResourcesPageProps {
  onNavigate?: (mod: GatewayModule) => void;
  selectedCategory?: 'all' | 'se' | 'data' | 'ai' | 'a11y';
  onSelectCategory?: (cat: 'all' | 'se' | 'data' | 'ai' | 'a11y') => void;
}

export const LearningResourcesPage: React.FC<LearningResourcesPageProps> = ({
  onNavigate,
  selectedCategory: controlledCategory,
  onSelectCategory,
}) => {
  const { t } = useI18n();
  const agent = useWebsiteAgent();
  const [internalCategory, setInternalCategory] = useState<'all' | 'se' | 'data' | 'ai' | 'a11y'>('all');
  const selectedCategory = controlledCategory ?? (agent ? agent.learningCategory : internalCategory);
  const setSelectedCategory = (cat: 'all' | 'se' | 'data' | 'ai' | 'a11y') => {
    setInternalCategory(cat);
    agent?.setLearningCategory(cat);
    onSelectCategory?.(cat);
  };

  const filteredTracks = useMemo(() => {
    if (selectedCategory === 'all') return LEARNING_TRACKS;
    return LEARNING_TRACKS.filter((item) => item.category === selectedCategory);
  }, [selectedCategory]);

  const filterButtons: Array<{ id: 'all' | 'se' | 'data' | 'ai' | 'a11y'; label: string }> = [
    { id: 'all', label: t.learning.filterAll },
    { id: 'se', label: 'Software Engineering' },
    { id: 'data', label: 'Data Science' },
    { id: 'ai', label: 'AI Essentials' },
    { id: 'a11y', label: 'Assistive Tech' },
  ];

  const getTrackIcon = (cat: LearningTrack['category']) => {
    switch (cat) {
      case 'se':
        return <Code2 className="w-5 h-5" aria-hidden="true" />;
      case 'data':
        return <Database className="w-5 h-5" aria-hidden="true" />;
      case 'ai':
        return <Cpu className="w-5 h-5" aria-hidden="true" />;
      default:
        return <Headphones className="w-5 h-5" aria-hidden="true" />;
    }
  };

  return (
    <div className="space-y-8">
      <header className="rounded-2xl bg-[#0F1E36] text-white p-6 sm:p-8 shadow-lg space-y-3">
        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
          <BookOpen className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{t.learning.hubBadge}</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
          {t.learning.pageTitle}
        </h1>
        <p className="text-sm sm:text-base text-slate-200 max-w-3xl leading-relaxed">
          {t.learning.pageSubtitle}
        </p>
        <div className="pt-1 flex flex-wrap items-center gap-3">
          <ReadAloudButton textToRead={`${t.learning.pageTitle}. ${t.learning.pageSubtitle}`} />
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('career')}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0F1E36] text-sm font-bold cursor-pointer"
            >
              {t.nav.careers}
            </button>
          )}
        </div>
      </header>

      <div
        role="group"
        aria-label="Filter learning tracks"
        onKeyDown={(e) => {
          if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
          const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
          const idx = btns.findIndex((b) => b === document.activeElement);
          if (idx === -1 || btns.length === 0) return;
          e.preventDefault();
          const next =
            e.key === 'ArrowRight'
              ? (idx + 1) % btns.length
              : e.key === 'ArrowLeft'
              ? (idx - 1 + btns.length) % btns.length
              : e.key === 'Home'
              ? 0
              : btns.length - 1;
          btns[next]?.focus();
        }}
        className="flex flex-wrap items-center gap-2"
      >
        {filterButtons.map((btn) => {
          const active = selectedCategory === btn.id;
          return (
            <button
              key={btn.id}
              type="button"
              aria-pressed={active}
              onClick={() => setSelectedCategory(btn.id)}
              className={`min-h-[44px] px-4 py-2 rounded-lg border text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                active
                  ? 'border-[#0F1E36] bg-[#0F1E36] text-white dark:border-amber-400 dark:bg-amber-500 dark:text-[#0F1E36]'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[#0F1E36] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {btn.label}
            </button>
          );
        })}
      </div>

      <section aria-label="Course catalog" className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredTracks.map((track) => {
          const audioText = `${track.title}. ${track.duration}. ${track.summary} ${
            t.learning.assistiveTipsHeading
          }: ${track.assistiveNotes.join(' ')}`;

          return (
            <article
              key={track.id}
              aria-labelledby={`track-title-${track.id}`}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs flex flex-col justify-between gap-5"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#0F1E36]/10 dark:bg-slate-800 text-[#1E3A5F] dark:text-amber-400 shrink-0">
                    {getTrackIcon(track.category)}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    {track.duration}
                  </span>
                </div>

                <h2
                  id={`track-title-${track.id}`}
                  className="text-xl font-bold text-[#0F1E36] dark:text-white"
                >
                  {track.title}
                </h2>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {track.summary}
                </p>

                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-4 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#1E3A5F] dark:text-amber-400 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t.learning.assistiveTipsHeading}</span>
                  </h3>
                  <ul className="space-y-1.5 text-xs sm:text-sm text-slate-700 dark:text-slate-200">
                    {track.assistiveNotes.map((note) => (
                      <li key={note} className="flex items-start gap-2">
                        <CheckCircle2
                          className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <ReadAloudButton textToRead={audioText} label={t.learning.listenGuideLabel} />
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate('onboarding')}
                    className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold text-[#0F1E36] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    {t.nav.startAction}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
};
