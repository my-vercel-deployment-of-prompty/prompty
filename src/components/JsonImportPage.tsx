import { ArrowLeft, CheckCircle2, Code2, Database, LogOut, Shield, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createPrompt, type PromptInput } from '../lib/promptStore';
import { extractPlaceholderKeys, humanizePlaceholderKey, normalizePlaceholderKey } from '../lib/placeholders';
import type { Category, PromptLanguage, PromptPlaceholder } from '../types';

type JsonImportPageProps = {
  adminAuthed: boolean;
  categories: Category[];
  loading: boolean;
  loginEmail: string;
  loginPassword: string;
  loginError: string | null;
  onBack: () => void;
  onImported: () => Promise<void>;
  onLoginEmailChange: (value: string) => void;
  onLoginPasswordChange: (value: string) => void;
  onLoginSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onLogout: () => void;
};

type JsonPromptRecord = Partial<
  Omit<PromptInput, 'placeholders' | 'tags' | 'primary_language'>
> & {
  primary_language?: string;
  placeholders?: unknown;
  tags?: unknown;
};

type JsonPlaceholderRecord = {
  key?: unknown;
  name?: unknown;
  label?: unknown;
  description?: unknown;
  default?: unknown;
  defaultValue?: unknown;
};

const placeholderExample = `[
  {
    "name": "الشخصية",
    "default": "الأرنب ذكي",
    "description": "اسم بطل القصة"
  },
  {
    "name": "المكان",
    "default": "الغابة السحرية",
    "description": "موقع أحداث القصة"
  },
  {
    "name": "القيمة",
    "default": "الصدق",
    "description": "الدرس المستفاد من القصة"
  }
]`;

const exampleJson = `[
  {
    "primary_language": "ar",
    "title_ar": "قصة تعليمية للأطفال",
    "prompt_ar": "اكتب قصة قصيرة عن [الشخصية] في [المكان] وتوضح قيمة [القيمة].",
    "usage": "لإنشاء قصة أطفال جاهزة للتعديل.",
    "title_en": "",
    "prompt_en": "",
    "usage_en": "",
    "category": "writing",
    "tags": ["قصص", "أطفال", "تعليم"],
    "placeholders": [
      {
        "name": "الشخصية",
        "default": "الأرنب ذكي",
        "description": "اسم بطل القصة"
      },
      {
        "name": "المكان",
        "default": "الغابة السحرية",
        "description": "موقع أحداث القصة"
      },
      {
        "name": "القيمة",
        "default": "الصدق",
        "description": "الدرس المستفاد من القصة"
      }
    ]
  }
]`;

const aiInstruction = `أنت مساعد ينشئ بيانات JSON لإضافتها إلى مكتبة برومبتات.

أعد فقط JSON صالح، بدون Markdown وبدون شرح خارجي.
يجب أن يكون الناتج Array من العناصر. كل عنصر يمثل برومبت واحد.

الحقول المطلوبة:
- primary_language: إما "ar" أو "en".
- title_ar و prompt_ar و usage للنسخة العربية.
- title_en و prompt_en و usage_en للنسخة الإنجليزية، ويمكن تركها فارغة إذا لم توجد نسخة إنجليزية.
- category: slug التصنيف الموجود في الموقع.
- tags: مصفوفة وسوم مثل ["كتابة", "تعليم"].
- placeholders: مصفوفة بيانات المتغيرات.

المتغيرات داخل نص البرومبت يجب أن تكتب بين أقواس مربعة بنفس الاسم تماماً، مثل:
[الشخصية] و [المكان] و [القيمة]

وحقل placeholders يجب أن يكون بهذا الشكل تحديداً:
${placeholderExample}

كل name في placeholders يجب أن يطابق المتغير داخل النص بدون الأقواس.`;

function stringifyJsonValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLanguage(value: unknown): PromptLanguage {
  return value === 'en' ? 'en' : 'ar';
}

function normalizeTags(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(stringifyJsonValue).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizePlaceholders(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<PromptPlaceholder[]>((placeholders, item) => {
    if (!item || typeof item !== 'object') {
      return placeholders;
    }

    const placeholder = item as JsonPlaceholderRecord;
    const key = normalizePlaceholderKey(
      stringifyJsonValue(placeholder.key) || stringifyJsonValue(placeholder.name),
    );

    if (!key) {
      return placeholders;
    }

    placeholders.push({
      key,
      label:
        stringifyJsonValue(placeholder.label) ||
        stringifyJsonValue(placeholder.name) ||
        humanizePlaceholderKey(key),
      description: stringifyJsonValue(placeholder.description),
      defaultValue:
        stringifyJsonValue(placeholder.defaultValue) ||
        stringifyJsonValue(placeholder.default),
    });

    return placeholders;
  }, []);
}

function getPlaceholderSource(prompt: Pick<PromptInput, 'primary_language' | 'prompt_ar' | 'prompt_en'>) {
  const primaryText = prompt.primary_language === 'ar' ? prompt.prompt_ar : prompt.prompt_en;
  return primaryText.trim() || prompt.prompt_ar.trim() || prompt.prompt_en.trim();
}

function hasLanguageContent(
  prompt: Pick<PromptInput, 'title_ar' | 'prompt_ar' | 'usage' | 'title_en' | 'prompt_en' | 'usage_en'>,
  language: PromptLanguage,
) {
  if (language === 'ar') {
    return Boolean(prompt.title_ar.trim() && prompt.prompt_ar.trim() && prompt.usage.trim());
  }

  return Boolean(prompt.title_en.trim() && prompt.prompt_en.trim() && prompt.usage_en.trim());
}

function normalizePromptRecord(record: unknown, index: number, categorySlugs: Set<string>) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error(`العنصر رقم ${index + 1} يجب أن يكون Object.`);
  }

  const item = record as JsonPromptRecord;
  const payload: PromptInput = {
    primary_language: normalizeLanguage(item.primary_language),
    title_ar: stringifyJsonValue(item.title_ar),
    prompt_ar: stringifyJsonValue(item.prompt_ar),
    usage: stringifyJsonValue(item.usage),
    title_en: stringifyJsonValue(item.title_en),
    prompt_en: stringifyJsonValue(item.prompt_en),
    usage_en: stringifyJsonValue(item.usage_en),
    placeholders: normalizePlaceholders(item.placeholders),
    category: stringifyJsonValue(item.category),
    tags: normalizeTags(item.tags),
  };

  const hasArabicVersion = hasLanguageContent(payload, 'ar');
  const hasEnglishVersion = hasLanguageContent(payload, 'en');

  if (!hasLanguageContent(payload, payload.primary_language)) {
    throw new Error(`العنصر رقم ${index + 1}: أكمل حقول اللغة الأساسية.`);
  }

  if (!payload.category || !categorySlugs.has(payload.category)) {
    throw new Error(`العنصر رقم ${index + 1}: category يجب أن يكون slug لتصنيف موجود.`);
  }

  if (payload.tags.length === 0) {
    throw new Error(`العنصر رقم ${index + 1}: أضف tag واحداً على الأقل.`);
  }

  if ((payload.title_ar || payload.prompt_ar || payload.usage) && !hasArabicVersion) {
    throw new Error(`العنصر رقم ${index + 1}: النسخة العربية تحتاج title_ar و prompt_ar و usage.`);
  }

  if ((payload.title_en || payload.prompt_en || payload.usage_en) && !hasEnglishVersion) {
    throw new Error(`العنصر رقم ${index + 1}: النسخة الإنجليزية تحتاج title_en و prompt_en و usage_en.`);
  }

  const arabicPlaceholderKeys = extractPlaceholderKeys(payload.prompt_ar);
  const englishPlaceholderKeys = extractPlaceholderKeys(payload.prompt_en);

  if (
    hasArabicVersion &&
    hasEnglishVersion &&
    JSON.stringify(arabicPlaceholderKeys) !== JSON.stringify(englishPlaceholderKeys)
  ) {
    throw new Error(`العنصر رقم ${index + 1}: النسختان العربية والإنجليزية يجب أن تستخدما نفس المتغيرات.`);
  }

  const sourcePlaceholderKeys = extractPlaceholderKeys(getPlaceholderSource(payload));
  const metadataByKey = new Map(payload.placeholders.map((placeholder) => [placeholder.key, placeholder]));
  const missingMetadata = sourcePlaceholderKeys.find((key) => {
    const metadata = metadataByKey.get(key);
    return !metadata?.label || !metadata.description;
  });

  if (missingMetadata) {
    throw new Error(
      `العنصر رقم ${index + 1}: المتغير [${missingMetadata}] يحتاج name و default و description داخل placeholders.`,
    );
  }

  payload.placeholders = sourcePlaceholderKeys.map((key) => metadataByKey.get(key)!);

  return payload;
}

export function JsonImportPage({
  adminAuthed,
  categories,
  loading,
  loginEmail,
  loginPassword,
  loginError,
  onBack,
  onImported,
  onLoginEmailChange,
  onLoginPasswordChange,
  onLoginSubmit,
  onLogout,
}: JsonImportPageProps) {
  const [jsonText, setJsonText] = useState(exampleJson);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const categorySlugs = useMemo(
    () => new Set(categories.map((category) => category.slug)),
    [categories],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);

    if (loading || categories.length === 0) {
      setErrorMessage('انتظر حتى يتم تحميل التصنيفات قبل النشر.');
      return;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setErrorMessage('JSON غير صالح. تأكد من الأقواس والفواصل وعلامات الاقتباس.');
      return;
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      setErrorMessage('يجب أن يكون JSON عبارة عن Array وفيه عنصر واحد على الأقل.');
      return;
    }

    let payloads: PromptInput[];

    try {
      payloads = parsed.map((record, index) => normalizePromptRecord(record, index, categorySlugs));
    } catch (normalizationError) {
      setErrorMessage(
        normalizationError instanceof Error
          ? normalizationError.message
          : 'تعذر تجهيز JSON للنشر.',
      );
      return;
    }

    setSaving(true);

    try {
      for (const payload of payloads) {
        await createPrompt(payload);
      }

      setJsonText('');
      setStatusMessage(`تم نشر ${payloads.length} برومبت بنجاح.`);
      await onImported();
    } catch (submitError) {
      setErrorMessage(
        submitError instanceof Error ? submitError.message : 'تعذر نشر البرومبتات في قاعدة البيانات.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (!adminAuthed) {
    return (
      <div className="min-h-screen bg-[#f6f1e8] px-4 py-8 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-md rounded-[32px] border border-white/70 bg-white/90 p-8 shadow-soft">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-2xl bg-olive/10 p-3 text-olive">
              <Shield size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">استيراد JSON</h1>
              <p className="text-sm text-slate-500">سجّل الدخول قبل نشر البرومبتات.</p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={onLoginSubmit}>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">البريد الإلكتروني</span>
              <input
                type="email"
                value={loginEmail}
                onChange={(event) => onLoginEmailChange(event.target.value)}
                className="w-full rounded-2xl border border-[#e7dccd] bg-[#fffcf7] px-4 py-3 outline-none transition focus:border-bronze/40 focus:ring-4 focus:ring-bronze/10"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">كلمة المرور</span>
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => onLoginPasswordChange(event.target.value)}
                className="w-full rounded-2xl border border-[#e7dccd] bg-[#fffcf7] px-4 py-3 outline-none transition focus:border-bronze/40 focus:ring-4 focus:ring-bronze/10"
              />
            </label>

            {loginError && (
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{loginError}</p>
            )}

            <button
              type="submit"
              className="w-full rounded-full bg-olive px-5 py-3 font-medium text-white transition hover:bg-[#4d6040]"
            >
              دخول
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f1e8] px-4 py-8 text-ink sm:px-6 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full border border-bronze/20 bg-white/80 px-4 py-2 text-sm font-medium text-bronze transition hover:bg-bronze hover:text-white"
          >
            <ArrowLeft size={16} />
            العودة للمكتبة
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
          >
            <LogOut size={16} />
            تسجيل الخروج
          </button>
        </div>

        <section className="overflow-hidden rounded-[36px] border border-white/70 bg-white/90 shadow-soft">
          <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-6 bg-[linear-gradient(145deg,rgba(255,250,242,0.96),rgba(246,241,231,0.92))] p-6 sm:p-8">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-bronze/15 bg-white/80 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.24em] text-bronze">
                  <Sparkles size={14} />
                  JSON Import
                </div>
                <h1 className="text-3xl font-semibold leading-[1.35] sm:text-4xl">
                  أضف مجموعة برومبتات دفعة واحدة
                </h1>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  أعطِ الذكاء الاصطناعي التعليمات الجاهزة، خذ منه JSON، الصقه هنا، ثم انشره مباشرة في قاعدة البيانات.
                </p>
              </div>

              <div className="rounded-[26px] border border-bronze/10 bg-white/80 p-5">
                <div className="mb-3 flex items-center gap-2 text-bronze">
                  <Code2 size={18} />
                  <h2 className="font-semibold">النص الذي تعطيه للذكاء الاصطناعي</h2>
                </div>
                <textarea
                  readOnly
                  value={aiInstruction}
                  className="min-h-80 w-full resize-y rounded-[22px] border border-[#eadfce] bg-[#fffcf7] p-4 font-mono text-xs leading-6 text-slate-700 outline-none"
                  dir="rtl"
                />
              </div>

              <div className="rounded-[26px] border border-olive/10 bg-olive/5 p-5">
                <h2 className="mb-3 font-semibold text-olive">التصنيفات المتاحة</h2>
                <div className="flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <span
                      key={category.id}
                      className="rounded-full border border-olive/10 bg-white/80 px-3 py-1 text-xs text-slate-700"
                    >
                      {category.name_ar}: <code>{category.slug}</code>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <form className="space-y-5 p-6 sm:p-8" onSubmit={handleSubmit}>
              <div>
                <div className="mb-3 flex items-center gap-2 text-olive">
                  <Database size={18} />
                  <h2 className="text-xl font-semibold">الصق JSON هنا</h2>
                </div>
                <textarea
                  value={jsonText}
                  onChange={(event) => setJsonText(event.target.value)}
                  spellCheck={false}
                  className="min-h-[520px] w-full resize-y rounded-[28px] border border-[#eadfce] bg-[#fffcf7] p-5 font-mono text-sm leading-7 text-slate-800 outline-none transition focus:border-bronze/40 focus:ring-4 focus:ring-bronze/10"
                  dir="ltr"
                  placeholder={exampleJson}
                />
              </div>

              {statusMessage && (
                <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  <CheckCircle2 size={18} />
                  {statusMessage}
                </p>
              )}

              {errorMessage && (
                <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm leading-7 text-red-700">
                  {errorMessage}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={saving || loading}
                  className="rounded-full bg-olive px-6 py-3 font-medium text-white transition hover:bg-[#4d6040] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {saving ? 'جارٍ النشر...' : 'نشر البرومبتات'}
                </button>

                <button
                  type="button"
                  onClick={() => setJsonText(exampleJson)}
                  className="rounded-full border border-bronze/20 bg-white/80 px-5 py-3 text-sm font-medium text-bronze transition hover:bg-bronze hover:text-white"
                >
                  إعادة المثال
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
