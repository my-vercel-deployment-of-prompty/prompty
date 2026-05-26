import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Copy } from 'lucide-react';
import { buildPlaceholderDefinitions, buildPromptSegments, resolvePromptText } from '../lib/placeholders';
import type { PromptItem, PromptLanguage } from '../types';

type PromptCardProps = {
  prompt: PromptItem;
  categoryName: string;
  isCopied: boolean;
  onCopy: (promptText: string, promptId: string) => void;
};

function hasPromptVersion(prompt: PromptItem, language: PromptLanguage) {
  if (language === 'ar') {
    return Boolean(prompt.title_ar.trim() && prompt.prompt_ar.trim() && prompt.usage.trim());
  }

  return Boolean(prompt.title_en.trim() && prompt.prompt_en.trim() && prompt.usage_en.trim());
}

function getInitialLanguage(prompt: PromptItem): PromptLanguage {
  if (hasPromptVersion(prompt, prompt.primary_language)) {
    return prompt.primary_language;
  }

  return hasPromptVersion(prompt, 'ar') ? 'ar' : 'en';
}

function getPromptContent(prompt: PromptItem, language: PromptLanguage) {
  if (language === 'en') {
    return {
      title: prompt.title_en,
      text: prompt.prompt_en,
      usage: prompt.usage_en,
    };
  }

  return {
    title: prompt.title_ar,
    text: prompt.prompt_ar,
    usage: prompt.usage,
  };
}

export function PromptCard({
  prompt,
  categoryName,
  isCopied,
  onCopy,
}: PromptCardProps) {
  const hasArabic = hasPromptVersion(prompt, 'ar');
  const hasEnglish = hasPromptVersion(prompt, 'en');
  const canToggleLanguage = hasArabic && hasEnglish;
  const [activeLanguage, setActiveLanguage] = useState<PromptLanguage>(() => getInitialLanguage(prompt));
  const activeContent = getPromptContent(prompt, activeLanguage);
  const isEnglishActive = activeLanguage === 'en';
  const placeholderDefinitions = useMemo(
    () => buildPlaceholderDefinitions(activeContent.text, prompt.placeholders),
    [activeContent.text, prompt.placeholders],
  );
  const promptSegments = useMemo(() => buildPromptSegments(activeContent.text), [activeContent.text]);
  const cardRef = useRef<HTMLElement | null>(null);
  const [activePlaceholderKey, setActivePlaceholderKey] = useState<string | null>(null);
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      placeholderDefinitions.map((placeholder) => [
        placeholder.key,
        placeholder.defaultValue ?? '',
      ]),
    ),
  );

  useEffect(() => {
    setActiveLanguage(getInitialLanguage(prompt));
  }, [prompt]);

  useEffect(() => {
    setPlaceholderValues((current) =>
      Object.fromEntries(
        placeholderDefinitions.map((placeholder) => [
          placeholder.key,
          current[placeholder.key] ?? placeholder.defaultValue ?? '',
        ]),
      ),
    );
  }, [placeholderDefinitions]);

  useEffect(() => {
    setActivePlaceholderKey(null);
  }, [prompt.id, activeLanguage]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!cardRef.current?.contains(event.target as Node)) {
        setActivePlaceholderKey(null);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const missingPlaceholderCount = placeholderDefinitions.filter(
    (placeholder) => !placeholderValues[placeholder.key]?.trim(),
  ).length;
  const canCopy = placeholderDefinitions.length === 0 || missingPlaceholderCount === 0;
  const finalPromptText = resolvePromptText(activeContent.text, placeholderValues);
  const promptDirection = isEnglishActive ? 'ltr' : 'rtl';
  const promptAlignClass = isEnglishActive ? 'text-left' : 'text-right';

  return (
    <article
      ref={cardRef}
      className="group flex h-full flex-col rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-soft backdrop-blur transition duration-300 hover:-translate-y-1 hover:shadow-[0_26px_60px_rgba(36,27,20,0.14)] sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="rounded-full bg-sand px-3 py-1 text-xs font-semibold text-bronze">
          {categoryName}
        </span>
        <div className="flex items-center gap-2">
          {canToggleLanguage && (
            <button
              type="button"
              onClick={() => setActiveLanguage((current) => (current === 'ar' ? 'en' : 'ar'))}
              className="inline-flex items-center gap-1 rounded-full border border-bronze/15 bg-white px-1.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-bronze/30 hover:text-ink"
              aria-label={isEnglishActive ? 'Show Arabic version' : 'Show English version'}
            >
              <span
                className={`rounded-full px-2 py-1 transition ${
                  !isEnglishActive ? 'bg-bronze text-white' : 'text-slate-500'
                }`}
              >
                AR
              </span>
              <span
                className={`rounded-full px-2 py-1 transition ${
                  isEnglishActive ? 'bg-bronze text-white' : 'text-slate-500'
                }`}
              >
                EN
              </span>
            </button>
          )}
          <button
            type="button"
            disabled={!canCopy}
            onClick={() => onCopy(finalPromptText, prompt.id)}
            className="inline-flex items-center gap-2 rounded-full border border-bronze/20 bg-bronze/5 px-3 py-2 text-sm font-medium text-bronze transition hover:bg-bronze hover:text-white disabled:cursor-not-allowed disabled:border-emerald-200 disabled:bg-emerald-50 disabled:text-emerald-700 disabled:hover:bg-emerald-50 disabled:hover:text-emerald-700"
          >
            {isCopied ? <Check size={16} /> : <Copy size={16} />}
            <span>
              {isCopied
                ? 'تم النسخ'
                : canCopy
                  ? 'نسخ البرومبت'
                  : `أكمل ${missingPlaceholderCount} متغير`}
            </span>
          </button>
        </div>
      </div>

      <h3
        dir={promptDirection}
        className={`mb-3 text-xl font-semibold leading-8 text-ink ${promptAlignClass}`}
      >
        {activeContent.title}
      </h3>

      <div
        dir={promptDirection}
        className={`mb-4 rounded-[22px] bg-[#fcfaf5] p-4 text-sm leading-8 text-slate-700 ${promptAlignClass}`}
      >
        <p className="whitespace-pre-wrap">
          {promptSegments.map((segment, index) => {
            if (segment.type === 'text') {
              return <span key={`${prompt.id}-text-${index}`}>{segment.value}</span>;
            }

            const placeholder = placeholderDefinitions.find(
              (item) => item.key === segment.key,
            ) ?? {
              key: segment.key,
              label: segment.key,
              description: '',
              defaultValue: '',
            };
            const value = placeholderValues[segment.key]?.trim();
            const isActive = activePlaceholderKey === segment.key;

            return (
              <span
                key={`${prompt.id}-${segment.key}-${index}`}
                className="relative mx-0.5 inline-flex align-baseline"
              >
                <button
                  type="button"
                  onClick={() =>
                    setActivePlaceholderKey((current) =>
                      current === segment.key ? null : segment.key,
                    )
                  }
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
                >
                  {value && value.length > 0 ? value : segment.token}
                </button>

                {isActive && (
                  <div className="absolute right-0 top-full z-20 mt-3 w-72 rounded-[24px] border border-emerald-100 bg-white p-4 text-right shadow-[0_20px_45px_rgba(27,68,46,0.16)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      {placeholder.label}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {placeholder.description || 'أدخل القيمة المناسبة لهذا المتغير قبل النسخ.'}
                    </p>
                    <input
                      autoFocus
                      value={placeholderValues[segment.key] ?? ''}
                      onChange={(event) =>
                        setPlaceholderValues((current) => ({
                          ...current,
                          [segment.key]: event.target.value,
                        }))
                      }
                      placeholder={`اكتب ${placeholder.label}`}
                      className="mt-3 w-full rounded-2xl border border-[#d7ebde] bg-[#f8fffb] px-4 py-3 text-sm text-ink outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                    />
                  </div>
                )}
              </span>
            );
          })}
        </p>
      </div>

      {placeholderDefinitions.length > 0 && (
        <p className="mb-4 inline-flex items-center gap-2 text-sm text-emerald-700">
          <AlertCircle size={16} />
          <span>
            {canCopy
              ? 'كل المتغيرات جاهزة للنسخ.'
              : 'اضغط على المتغيرات الخضراء وأكملها قبل نسخ البرومبت.'}
          </span>
        </p>
      )}

      <p
        dir={promptDirection}
        className={`mb-4 text-sm leading-7 text-slate-600 ${promptAlignClass}`}
      >
        <span className="font-semibold text-ink">الاستخدام:</span> {activeContent.usage}
      </p>

      <div className="mt-auto flex flex-wrap gap-2">
        {prompt.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-olive/10 px-3 py-1 text-xs font-medium text-olive"
          >
            #{tag}
          </span>
        ))}
      </div>
    </article>
  );
}
