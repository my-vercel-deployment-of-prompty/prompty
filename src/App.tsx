import {
  Instagram,
  Linkedin,
  LogOut,
  PencilLine,
  Plus,
  Search,
  Send,
  Shield,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PromptCard } from './components/PromptCard';
import {
  buildPlaceholderDefinitions,
  extractPlaceholderKeys,
  humanizePlaceholderKey,
} from './lib/placeholders';
import {
  createCategory,
  createPrompt,
  deleteCategory,
  deletePrompt,
  fetchLibrary,
  updateCategory,
  updatePrompt,
  type CategoryInput,
  type PromptInput,
} from './lib/promptStore';
import type { Category, PromptItem, PromptPlaceholder } from './types';

const ALL_CATEGORY = 'all';
const MANAGE_PATH = '/manage';
const ADMIN_EMAIL = 'myemail@gmail.com';
const ADMIN_PASSWORD = '12345678';
const ADMIN_SESSION_KEY = 'prompty-admin-session';
const SOCIAL_PROMPT_KEY = 'prompty-social-prompt-dismissed';

const socialLinks = [
  {
    name: 'Telegram',
    href: 'https://telegram.com',
    icon: Send,
  },
  {
    name: 'Instagram',
    href: 'https://instagram.com',
    icon: Instagram,
  },
  {
    name: 'LinkedIn',
    href: 'https://linkedin.com',
    icon: Linkedin,
  },
] as const;

type CategoryFormState = {
  name_ar: string;
  slug: string;
  order: string;
};

type PromptFormState = {
  title_ar: string;
  prompt_ar: string;
  placeholders: Record<string, PromptPlaceholderFormState>;
  category: string;
  usage: string;
  tags: string;
};

type PromptPlaceholderFormState = {
  label: string;
  description: string;
  defaultValue: string;
};

const emptyCategoryForm: CategoryFormState = {
  name_ar: '',
  slug: '',
  order: '',
};

const emptyPromptForm: PromptFormState = {
  title_ar: '',
  prompt_ar: '',
  placeholders: {},
  category: '',
  usage: '',
  tags: '',
};

function getInitialPath() {
  if (typeof window === 'undefined') {
    return '/';
  }

  return window.location.pathname || '/';
}

function readAdminSession() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(ADMIN_SESSION_KEY) === 'true';
}

function readSocialPromptState() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(SOCIAL_PROMPT_KEY) === 'true';
}

function splitTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function categoryToForm(category: Category): CategoryFormState {
  return {
    name_ar: category.name_ar,
    slug: category.slug,
    order: String(category.order),
  };
}

function promptToForm(prompt: PromptItem): PromptFormState {
  const placeholders = buildPlaceholderDefinitions(prompt.prompt_ar, prompt.placeholders).reduce<
    Record<string, PromptPlaceholderFormState>
  >((accumulator, placeholder) => {
    accumulator[placeholder.key] = {
      label: placeholder.label,
      description: placeholder.description,
      defaultValue: placeholder.defaultValue ?? '',
    };
    return accumulator;
  }, {});

  return {
    title_ar: prompt.title_ar,
    prompt_ar: prompt.prompt_ar,
    placeholders,
    category: prompt.category,
    usage: prompt.usage,
    tags: prompt.tags.join(', '),
  };
}

function toCategoryInput(form: CategoryFormState): CategoryInput {
  return {
    name_ar: form.name_ar.trim(),
    slug: form.slug.trim(),
    order: Number(form.order),
  };
}

function toPromptInput(form: PromptFormState): PromptInput {
  const placeholders = extractPlaceholderKeys(form.prompt_ar).map((key) => {
    const metadata = form.placeholders[key];

    return {
      key,
      label: metadata?.label.trim() || humanizePlaceholderKey(key),
      description: metadata?.description.trim() || '',
      defaultValue: metadata?.defaultValue.trim() || '',
    } satisfies PromptPlaceholder;
  });

  return {
    title_ar: form.title_ar.trim(),
    prompt_ar: form.prompt_ar.trim(),
    placeholders,
    category: form.category,
    usage: form.usage.trim(),
    tags: splitTags(form.tags),
  };
}

function syncPlaceholderFormState(
  promptText: string,
  previousState: Record<string, PromptPlaceholderFormState>,
) {
  return extractPlaceholderKeys(promptText).reduce<Record<string, PromptPlaceholderFormState>>(
    (accumulator, key) => {
      const existing = previousState[key];

      accumulator[key] = {
        label: existing?.label || humanizePlaceholderKey(key),
        description: existing?.description || '',
        defaultValue: existing?.defaultValue || '',
      };

      return accumulator;
    },
    {},
  );
}

function App() {
  const [pathname, setPathname] = useState(getInitialPath);
  const [categories, setCategories] = useState<Category[]>([]);
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORY);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [adminAuthed, setAdminAuthed] = useState(readAdminSession);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [dismissedSocialPrompt, setDismissedSocialPrompt] = useState(readSocialPromptState);
  const [librarySource, setLibrarySource] = useState<'local' | 'fallback' | 'supabase' | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(emptyCategoryForm);
  const [promptForm, setPromptForm] = useState<PromptFormState>(emptyPromptForm);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isManagePage = pathname === MANAGE_PATH;
  const detectedPlaceholderKeys = useMemo(
    () => extractPlaceholderKeys(promptForm.prompt_ar),
    [promptForm.prompt_ar],
  );

  async function loadData() {
    setLoading(true);

    const result = await fetchLibrary();
    setCategories(result.categories);
    setPrompts(result.prompts);
    setError(result.error);
    setLibrarySource(result.source);
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const handlePopState = () => setPathname(getInitialPath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!copiedId) {
      return;
    }

    const timer = window.setTimeout(() => setCopiedId(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copiedId]);

  useEffect(() => {
    if (!promptForm.category && categories.length > 0) {
      setPromptForm((current) => ({
        ...current,
        category: categories[0].slug,
      }));
    }
  }, [categories, promptForm.category]);

  const categoriesWithAll = useMemo(
    () => [{ id: ALL_CATEGORY, slug: ALL_CATEGORY, name_ar: 'الكل', order: 0 }, ...categories],
    [categories],
  );

  const filteredPrompts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return prompts.filter((prompt) => {
      const matchesCategory =
        activeCategory === ALL_CATEGORY || prompt.category === activeCategory;

      const haystack = [prompt.title_ar, prompt.prompt_ar, prompt.usage, prompt.tags.join(' ')]
        .join(' ')
        .toLowerCase();

      const matchesSearch =
        normalizedQuery.length === 0 || haystack.includes(normalizedQuery);

      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, prompts, query]);

  const groupedPrompts = useMemo(() => {
    return categories.map((category) => ({
      category,
      prompts: filteredPrompts.filter((prompt) => prompt.category === category.slug),
    }));
  }, [categories, filteredPrompts]);

  const totalPromptCount = prompts.length;

  async function handleCopy(promptText: string, promptId: string) {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopiedId(promptId);
    } catch {
      setCopiedId(null);
    }
  }

  function navigateTo(path: string) {
    if (typeof window === 'undefined') {
      return;
    }

    window.history.pushState({}, '', path);
    setPathname(path);
  }

  function dismissSocialPrompt() {
    window.localStorage.setItem(SOCIAL_PROMPT_KEY, 'true');
    setDismissedSocialPrompt(true);
  }

  function handleCategoryNavClick(slug: string) {
    setActiveCategory(ALL_CATEGORY);
    requestAnimationFrame(() => {
      const target = document.getElementById(`category-${slug}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function resetCategoryEditor() {
    setCategoryForm(emptyCategoryForm);
    setEditingCategoryId(null);
  }

  function resetPromptEditor() {
    setPromptForm({
      ...emptyPromptForm,
      category: categories[0]?.slug ?? '',
    });
    setEditingPromptId(null);
  }

  function handlePromptTextChange(value: string) {
    setPromptForm((current) => ({
      ...current,
      prompt_ar: value,
      placeholders: syncPlaceholderFormState(value, current.placeholders),
    }));
  }

  function handlePlaceholderFieldChange(
    key: string,
    field: keyof PromptPlaceholderFormState,
    value: string,
  ) {
    setPromptForm((current) => ({
      ...current,
      placeholders: {
        ...current.placeholders,
        [key]: {
          label: current.placeholders[key]?.label || humanizePlaceholderKey(key),
          description: current.placeholders[key]?.description || '',
          defaultValue: current.placeholders[key]?.defaultValue || '',
          [field]: value,
        },
      },
    }));
  }

  function handleLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loginEmail === ADMIN_EMAIL && loginPassword === ADMIN_PASSWORD) {
      window.localStorage.setItem(ADMIN_SESSION_KEY, 'true');
      setAdminAuthed(true);
      setLoginError(null);
      return;
    }

    setLoginError('بيانات الدخول غير صحيحة.');
  }

  function handleLogout() {
    window.localStorage.removeItem(ADMIN_SESSION_KEY);
    setAdminAuthed(false);
    setLoginEmail('');
    setLoginPassword('');
    setLoginError(null);
  }

  async function handleCategorySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = toCategoryInput(categoryForm);

    if (!payload.name_ar || !payload.slug || Number.isNaN(payload.order)) {
      setInfoMessage('أدخل اسم التصنيف و slug وترتيباً صحيحاً.');
      return;
    }

    setSavingCategory(true);
    setInfoMessage(null);

    try {
      if (editingCategoryId) {
        await updateCategory(editingCategoryId, payload);
        setInfoMessage('تم تحديث التصنيف بنجاح.');
      } else {
        await createCategory(payload);
        setInfoMessage('تم إنشاء التصنيف بنجاح.');
      }

      resetCategoryEditor();
      await loadData();
    } catch (submitError) {
      setInfoMessage(
        submitError instanceof Error ? submitError.message : 'تعذر حفظ التصنيف.',
      );
    } finally {
      setSavingCategory(false);
    }
  }

  async function handlePromptSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = toPromptInput(promptForm);

    if (
      !payload.title_ar ||
      !payload.prompt_ar ||
      !payload.category ||
      !payload.usage ||
      payload.tags.length === 0
    ) {
      setInfoMessage('املأ جميع حقول البرومبت وأدخل وسمًا واحدًا على الأقل.');
      return;
    }

    const missingPlaceholderMetadata = payload.placeholders.some(
      (placeholder) => !placeholder.label || !placeholder.description,
    );

    if (missingPlaceholderMetadata) {
      setInfoMessage('أكمل اسم العرض والوصف لكل متغير تم اكتشافه داخل البرومبت.');
      return;
    }

    setSavingPrompt(true);
    setInfoMessage(null);

    try {
      if (editingPromptId) {
        await updatePrompt(editingPromptId, payload);
        setInfoMessage('تم تحديث البرومبت بنجاح.');
      } else {
        await createPrompt(payload);
        setInfoMessage('تم إنشاء البرومبت بنجاح.');
      }

      resetPromptEditor();
      await loadData();
    } catch (submitError) {
      setInfoMessage(
        submitError instanceof Error ? submitError.message : 'تعذر حفظ البرومبت.',
      );
    } finally {
      setSavingPrompt(false);
    }
  }

  async function handleDeleteCategory(category: Category) {
    setDeletingId(category.id);
    setInfoMessage(null);

    try {
      await deleteCategory(category.id);
      if (editingCategoryId === category.id) {
        resetCategoryEditor();
      }
      await loadData();
      setInfoMessage('تم حذف التصنيف.');
    } catch (deleteError) {
      setInfoMessage(
        deleteError instanceof Error ? deleteError.message : 'تعذر حذف التصنيف.',
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeletePrompt(prompt: PromptItem) {
    setDeletingId(prompt.id);
    setInfoMessage(null);

    try {
      await deletePrompt(prompt.id);
      if (editingPromptId === prompt.id) {
        resetPromptEditor();
      }
      await loadData();
      setInfoMessage('تم حذف البرومبت.');
    } catch (deleteError) {
      setInfoMessage(
        deleteError instanceof Error ? deleteError.message : 'تعذر حذف البرومبت.',
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (isManagePage) {
    return (
      <div className="min-h-screen bg-[#f6f1e8] px-4 py-8 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {!adminAuthed ? (
            <div className="mx-auto max-w-md rounded-[32px] border border-white/70 bg-white/90 p-8 shadow-soft">
              <div className="mb-6 flex items-center gap-3">
                <div className="rounded-2xl bg-olive/10 p-3 text-olive">
                  <Shield size={24} />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold">لوحة الإدارة</h1>
                  <p className="text-sm text-slate-500">الدخول عبر المسار السري `/manage`</p>
                </div>
              </div>

              <form className="space-y-4" onSubmit={handleLoginSubmit}>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">البريد الإلكتروني</span>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(event) => setLoginEmail(event.target.value)}
                    className="w-full rounded-2xl border border-[#e7dccd] bg-[#fffcf7] px-4 py-3 outline-none transition focus:border-bronze/40 focus:ring-4 focus:ring-bronze/10"
                    placeholder="myemail@gmail.com"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">كلمة المرور</span>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                    className="w-full rounded-2xl border border-[#e7dccd] bg-[#fffcf7] px-4 py-3 outline-none transition focus:border-bronze/40 focus:ring-4 focus:ring-bronze/10"
                    placeholder="12345678"
                  />
                </label>

                {loginError && (
                  <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {loginError}
                  </p>
                )}

                <button
                  type="submit"
                  className="w-full rounded-2xl bg-olive px-4 py-3 font-medium text-white transition hover:bg-[#4d6040]"
                >
                  دخول
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="flex flex-col gap-4 rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-soft lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-medium text-bronze">Prompty Admin</p>
                  <h1 className="text-3xl font-semibold">إدارة البرومبتات والتصنيفات</h1>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    من هنا يمكنك إنشاء التصنيفات وتعديلها وحذفها، وإضافة البرومبتات أو تحديثها أو حذفها.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => navigateTo('/')}
                    className="rounded-full border border-bronze/20 bg-white px-4 py-2 text-sm font-medium text-bronze transition hover:bg-bronze hover:text-white"
                  >
                    الرجوع للموقع
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                  >
                    <LogOut size={16} />
                    تسجيل الخروج
                  </button>
                </div>
              </div>

              {loading && (
                <div className="rounded-[28px] border border-dashed border-bronze/25 bg-white/70 p-6 text-center text-slate-600">
                  جاري تحميل البيانات...
                </div>
              )}

              {(error || infoMessage) && (
                <div className="rounded-[28px] border border-bronze/15 bg-[#fff8ef] p-5 text-sm leading-7 text-slate-700">
                  {infoMessage ?? error}
                </div>
              )}

              <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                <section className="space-y-6 rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-soft">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-bronze">التصنيفات</p>
                      <h2 className="text-2xl font-semibold">إدارة التصنيفات</h2>
                    </div>
                    <button
                      type="button"
                      onClick={resetCategoryEditor}
                      className="inline-flex items-center gap-2 rounded-full border border-olive/20 bg-olive/10 px-4 py-2 text-sm font-medium text-olive"
                    >
                      <Plus size={16} />
                      تصنيف جديد
                    </button>
                  </div>

                  <form className="space-y-4" onSubmit={handleCategorySubmit}>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">اسم التصنيف</span>
                      <input
                        value={categoryForm.name_ar}
                        onChange={(event) =>
                          setCategoryForm((current) => ({
                            ...current,
                            name_ar: event.target.value,
                          }))
                        }
                        className="w-full rounded-2xl border border-[#e7dccd] bg-[#fffcf7] px-4 py-3 outline-none transition focus:border-bronze/40 focus:ring-4 focus:ring-bronze/10"
                        placeholder="مثال: كتابة"
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">Slug</span>
                      <input
                        value={categoryForm.slug}
                        onChange={(event) =>
                          setCategoryForm((current) => ({
                            ...current,
                            slug: event.target.value,
                          }))
                        }
                        className="w-full rounded-2xl border border-[#e7dccd] bg-[#fffcf7] px-4 py-3 outline-none transition focus:border-bronze/40 focus:ring-4 focus:ring-bronze/10"
                        placeholder="example-category"
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">الترتيب</span>
                      <input
                        type="number"
                        min="1"
                        value={categoryForm.order}
                        onChange={(event) =>
                          setCategoryForm((current) => ({
                            ...current,
                            order: event.target.value,
                          }))
                        }
                        className="w-full rounded-2xl border border-[#e7dccd] bg-[#fffcf7] px-4 py-3 outline-none transition focus:border-bronze/40 focus:ring-4 focus:ring-bronze/10"
                        placeholder="1"
                      />
                    </label>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="submit"
                        disabled={savingCategory}
                        className="rounded-full bg-olive px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#4d6040] disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {savingCategory
                          ? 'جارٍ الحفظ...'
                          : editingCategoryId
                            ? 'حفظ التعديل'
                            : 'إضافة التصنيف'}
                      </button>
                      {editingCategoryId && (
                        <button
                          type="button"
                          onClick={resetCategoryEditor}
                          className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600"
                        >
                          إلغاء
                        </button>
                      )}
                    </div>
                  </form>

                  <div className="space-y-3">
                    {categories.map((category) => {
                      const promptCount = prompts.filter(
                        (prompt) => prompt.category === category.slug,
                      ).length;

                      return (
                        <div
                          key={category.id}
                          className="flex flex-col gap-4 rounded-[24px] border border-[#f0e7db] bg-[#fffcf8] p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <h3 className="text-lg font-semibold">{category.name_ar}</h3>
                            <p className="text-sm text-slate-500">
                              slug: {category.slug} | الترتيب: {category.order} | البرومبتات: {promptCount}
                            </p>
                          </div>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCategoryId(category.id);
                                setCategoryForm(categoryToForm(category));
                              }}
                              className="inline-flex items-center gap-2 rounded-full border border-bronze/20 px-4 py-2 text-sm font-medium text-bronze"
                            >
                              <PencilLine size={16} />
                              تعديل
                            </button>
                            <button
                              type="button"
                              disabled={promptCount > 0 || deletingId === category.id}
                              onClick={() => void handleDeleteCategory(category)}
                              className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Trash2 size={16} />
                              حذف
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="space-y-6 rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-soft">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-bronze">البرومبتات</p>
                      <h2 className="text-2xl font-semibold">إدارة البرومبتات</h2>
                    </div>
                    <button
                      type="button"
                      onClick={resetPromptEditor}
                      className="inline-flex items-center gap-2 rounded-full border border-olive/20 bg-olive/10 px-4 py-2 text-sm font-medium text-olive"
                    >
                      <Plus size={16} />
                      برومبت جديد
                    </button>
                  </div>

                  <form className="space-y-4" onSubmit={handlePromptSubmit}>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">العنوان</span>
                      <input
                        value={promptForm.title_ar}
                        onChange={(event) =>
                          setPromptForm((current) => ({
                            ...current,
                            title_ar: event.target.value,
                          }))
                        }
                        className="w-full rounded-2xl border border-[#e7dccd] bg-[#fffcf7] px-4 py-3 outline-none transition focus:border-bronze/40 focus:ring-4 focus:ring-bronze/10"
                        placeholder="عنوان البرومبت"
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">النص</span>
                      <textarea
                        value={promptForm.prompt_ar}
                        onChange={(event) => handlePromptTextChange(event.target.value)}
                        className="min-h-36 w-full rounded-2xl border border-[#e7dccd] bg-[#fffcf7] px-4 py-3 outline-none transition focus:border-bronze/40 focus:ring-4 focus:ring-bronze/10"
                        placeholder="اكتب نص البرومبت هنا، مثل: اكتب مقالًا عن [الموضوع]"
                      />
                    </label>

                    <div className="space-y-4 rounded-[24px] border border-dashed border-emerald-200 bg-emerald-50/60 p-4">
                      <div>
                        <p className="text-sm font-semibold text-emerald-800">
                          إعدادات المتغيرات التفاعلية
                        </p>
                        <p className="mt-1 text-sm leading-6 text-emerald-900/80">
                          أي نص بين أقواس مربعة مثل <code>[topic]</code> سيتم اكتشافه تلقائياً
                          وإظهاره للمستخدم كحقل قابل للتعبئة قبل النسخ.
                        </p>
                      </div>

                      {detectedPlaceholderKeys.length === 0 ? (
                        <p className="text-sm text-slate-600">
                          لا توجد متغيرات حالياً. أضف متغيراً داخل النص باستخدام الصيغة{' '}
                          <code>[اسم المتغير]</code>.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {detectedPlaceholderKeys.map((key) => {
                            const metadata = promptForm.placeholders[key] ?? {
                              label: humanizePlaceholderKey(key),
                              description: '',
                              defaultValue: '',
                            };

                            return (
                              <div
                                key={key}
                                className="rounded-[22px] border border-emerald-100 bg-white/90 p-4"
                              >
                                <div className="mb-3 flex flex-wrap items-center gap-3">
                                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                                    {`[${key}]`}
                                  </span>
                                  <span className="text-sm text-slate-500">
                                    المتغير المكتشف من نص البرومبت
                                  </span>
                                </div>

                                <div className="grid gap-3 lg:grid-cols-2">
                                  <label className="block space-y-2">
                                    <span className="text-sm font-medium text-slate-700">
                                      اسم الحقل
                                    </span>
                                    <input
                                      value={metadata.label}
                                      onChange={(event) =>
                                        handlePlaceholderFieldChange(
                                          key,
                                          'label',
                                          event.target.value,
                                        )
                                      }
                                      className="w-full rounded-2xl border border-[#d7ebde] bg-[#f8fffb] px-4 py-3 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                                      placeholder="مثال: Topic"
                                    />
                                  </label>

                                  <label className="block space-y-2">
                                    <span className="text-sm font-medium text-slate-700">
                                      قيمة افتراضية اختيارية
                                    </span>
                                    <input
                                      value={metadata.defaultValue}
                                      onChange={(event) =>
                                        handlePlaceholderFieldChange(
                                          key,
                                          'defaultValue',
                                          event.target.value,
                                        )
                                      }
                                      className="w-full rounded-2xl border border-[#d7ebde] bg-[#f8fffb] px-4 py-3 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                                      placeholder="يمكن تركها فارغة"
                                    />
                                  </label>
                                </div>

                                <label className="mt-3 block space-y-2">
                                  <span className="text-sm font-medium text-slate-700">
                                    الوصف والإرشادات للمستخدم
                                  </span>
                                  <textarea
                                    value={metadata.description}
                                    onChange={(event) =>
                                      handlePlaceholderFieldChange(
                                        key,
                                        'description',
                                        event.target.value,
                                      )
                                    }
                                    className="min-h-24 w-full rounded-2xl border border-[#d7ebde] bg-[#f8fffb] px-4 py-3 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                                    placeholder="مثال: أدخل الموضوع الذي تريد أن يدور حوله المقال."
                                  />
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">التصنيف</span>
                      <select
                        value={promptForm.category}
                        onChange={(event) =>
                          setPromptForm((current) => ({
                            ...current,
                            category: event.target.value,
                          }))
                        }
                        className="w-full rounded-2xl border border-[#e7dccd] bg-[#fffcf7] px-4 py-3 outline-none transition focus:border-bronze/40 focus:ring-4 focus:ring-bronze/10"
                      >
                        {categories.map((category) => (
                          <option key={category.id} value={category.slug}>
                            {category.name_ar}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">الاستخدام</span>
                      <input
                        value={promptForm.usage}
                        onChange={(event) =>
                          setPromptForm((current) => ({
                            ...current,
                            usage: event.target.value,
                          }))
                        }
                        className="w-full rounded-2xl border border-[#e7dccd] bg-[#fffcf7] px-4 py-3 outline-none transition focus:border-bronze/40 focus:ring-4 focus:ring-bronze/10"
                        placeholder="متى يفيد هذا البرومبت؟"
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">الوسوم</span>
                      <input
                        value={promptForm.tags}
                        onChange={(event) =>
                          setPromptForm((current) => ({
                            ...current,
                            tags: event.target.value,
                          }))
                        }
                        className="w-full rounded-2xl border border-[#e7dccd] bg-[#fffcf7] px-4 py-3 outline-none transition focus:border-bronze/40 focus:ring-4 focus:ring-bronze/10"
                        placeholder="وسم 1, وسم 2, وسم 3"
                      />
                    </label>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="submit"
                        disabled={savingPrompt || categories.length === 0}
                        className="rounded-full bg-olive px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#4d6040] disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {savingPrompt
                          ? 'جارٍ الحفظ...'
                          : editingPromptId
                            ? 'حفظ التعديل'
                            : 'إضافة البرومبت'}
                      </button>
                      {editingPromptId && (
                        <button
                          type="button"
                          onClick={resetPromptEditor}
                          className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600"
                        >
                          إلغاء
                        </button>
                      )}
                    </div>
                  </form>

                  <div className="space-y-3">
                    {prompts.map((prompt) => {
                      const categoryName =
                        categories.find((category) => category.slug === prompt.category)?.name_ar ??
                        prompt.category;

                      return (
                        <div
                          key={prompt.id}
                          className="rounded-[24px] border border-[#f0e7db] bg-[#fffcf8] p-4"
                        >
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-2">
                              <h3 className="text-lg font-semibold">{prompt.title_ar}</h3>
                              <p className="line-clamp-3 text-sm leading-7 text-slate-600">
                                {prompt.prompt_ar}
                              </p>
                              <p className="text-sm text-slate-500">
                                {categoryName} | الوسوم: {prompt.tags.join('، ')}
                              </p>
                              {prompt.placeholders.length > 0 && (
                                <p className="text-sm text-emerald-700">
                                  {prompt.placeholders.length} متغير تفاعلي
                                </p>
                              )}
                            </div>

                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPromptId(prompt.id);
                                  setPromptForm(promptToForm(prompt));
                                }}
                                className="inline-flex items-center gap-2 rounded-full border border-bronze/20 px-4 py-2 text-sm font-medium text-bronze"
                              >
                                <PencilLine size={16} />
                                تعديل
                              </button>
                              <button
                                type="button"
                                disabled={deletingId === prompt.id}
                                onClick={() => void handleDeletePrompt(prompt)}
                                className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Trash2 size={16} />
                                حذف
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-ink">
      {librarySource !== null && librarySource !== 'supabase' && (
        <div className="border-b border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900 sm:px-6 lg:px-8">
          {librarySource === 'local' ? (
            <p>
              الموقع غير متصل بقاعدة بيانات Supabase حالياً. التعديلات تحفظ فقط على هذا المتصفح.
              تأكد من إعداد المتغيرين <code>VITE_SUPABASE_URL</code> و <code>VITE_SUPABASE_ANON_KEY</code> في بيئة النشر.
            </p>
          ) : (
            <p>
              تعذر جلب البيانات من Supabase، لذلك يتم عرض بيانات بديلة محلياً. التعديلات الحالية لا تتزامن مع قاعدة البيانات.
            </p>
          )}
        </div>
      )}

      {!dismissedSocialPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,27,22,0.42)] px-4">
          <div className="relative w-full max-w-lg rounded-[34px] border border-white/70 bg-[#fffaf2] p-7 shadow-[0_28px_70px_rgba(38,30,22,0.22)]">
            <button
              type="button"
              onClick={dismissSocialPrompt}
              className="absolute left-4 top-4 rounded-full border border-bronze/15 bg-white/90 p-2 text-slate-500 transition hover:text-ink"
              aria-label="إغلاق"
            >
              <X size={18} />
            </button>

            <div className="mb-5 max-w-md">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-bronze/15 bg-white/80 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.24em] text-bronze">
                <Sparkles size={14} />
                <span>تحسين مهدي</span>
              </div>
              <h2 className="text-2xl font-semibold leading-10">
                تابعني على تيليجرام وإنستغرام ولينكدإن
              </h2>
              
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {socialLinks.map(({ name, href, icon: Icon }) => (
                <a
                  key={name}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="group rounded-[26px] border border-[#eadfce] bg-white/85 p-4 text-center transition hover:-translate-y-1 hover:border-bronze/30 hover:shadow-soft"
                >
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sand text-bronze transition group-hover:bg-bronze group-hover:text-white">
                    <Icon size={20} />
                  </div>
                  <p className="text-sm font-semibold text-ink">{name}</p>
                  <p className="mt-1 text-xs text-slate-500">اضغط للمتابعة</p>
                </a>
              ))}
            </div>
            <div className="mt-5 rounded-[24px] border border-[#eadfce] bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(244,236,224,0.92))] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.26em] text-bronze/80">
                Designed by
              </p>
              <p className="mt-1 text-lg font-semibold tracking-[0.08em] text-ink">
                تحسين مهدي
              </p>
            </div>
          </div>
        </div>
      )}

      <header className="border-b border-white/60 bg-[#fffaf2]/85 backdrop-blur-xl">
        <div className="border-b border-bronze/10 bg-[linear-gradient(90deg,rgba(126,92,54,0.08),rgba(255,255,255,0.55),rgba(109,129,94,0.12))]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-3 px-4 py-2 text-center text-sm text-slate-700 sm:px-6 lg:px-8">
            <span className="font-medium">
              تابعني على تيليجرام وإنستغرام ولينكدإن  </span>
            <div className="flex items-center gap-2">
              {socialLinks.map(({ name, href, icon: Icon }) => (
                <a
                  key={name}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-bronze/15 bg-white/80 text-bronze transition hover:bg-bronze hover:text-white"
                  aria-label={name}
                  title={name}
                >
                  <Icon size={16} />
                </a>
              ))}
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-bronze/15 bg-white/75 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-bronze">
              <Sparkles size={14} />
              <span>تحسين مهدي</span>
            </div>
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <a href="#top" className="flex items-center gap-3 text-lg font-semibold tracking-tight text-ink hover:opacity-80 transition">
              <img src="/favicon.png" alt="Prompty Logo" className="h-24 w-24 rounded-lg" />
مكتبة البرومتات             </a>
          </div>

          <nav className="scrollbar-none flex items-center gap-2 overflow-x-auto pb-1">
            {categories.map((category) => (
              <button
                key={category.slug}
                type="button"
                onClick={() => handleCategoryNavClick(category.slug)}
                className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-ink"
              >
                {category.name_ar}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-hero-glow" />
          <div className="mx-auto grid max-w-7xl gap-8 px-4 pb-12 pt-10 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:pb-16 lg:pt-16">
            <div className="space-y-6">
              <span className="inline-flex rounded-full border border-bronze/20 bg-white/80 px-4 py-2 text-sm font-medium text-bronze">
دع الذكاء الاصطناعي يفهم ماتريد من تجارب غيرك              </span>
              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-semibold leading-[1.35] text-ink sm:text-5xl lg:text-6xl">
                  اكتشف برومبتات عملية للكتابة والبرمجة والتعليم والأعمال
                </h1>
                <p className="max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
                  مكتبة عربية مصممة لتكون مرجعك السريع للبرومبتات الاحترافية. ابحث، صفِّ، وانسخ
                  النص المناسب فوراً من واجهة خفيفة وسريعة.
                </p>
              </div>

              <label className="relative block max-w-2xl">
                <span className="sr-only">ابحث في البرومبتات</span>
                <Search
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={20}
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ابحث بالعنوان أو النص أو الوسوم..."
                  className="w-full rounded-[26px] border border-white/70 bg-white/90 py-4 pl-4 pr-12 text-base text-ink shadow-soft outline-none transition placeholder:text-slate-400 focus:border-bronze/40 focus:ring-4 focus:ring-bronze/10"
                />
              </label>

              <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                <span className="rounded-full bg-white/80 px-4 py-2 shadow-sm">
                  {totalPromptCount} برومبت متاح
                </span>
                <span className="rounded-full bg-white/80 px-4 py-2 shadow-sm">
                  {categories.length} تصنيفات رئيسية
                </span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {categories.slice(0, 4).map((category, index) => (
                <div
                  key={category.slug}
                  className={`rounded-[30px] border border-white/70 p-5 shadow-soft ${
                    index % 2 === 0 ? 'bg-white/80' : 'bg-sand/85'
                  }`}
                >
                  <p className="mb-2 text-sm font-medium text-bronze">{category.name_ar}</p>
                  <h2 className="mb-3 text-xl font-semibold leading-8">مكتبة منظمة لهذا التصنيف</h2>
                  <p className="text-sm leading-7 text-slate-600">
                    تصفح مجموعة مختارة قابلة للنسخ الفوري، مع نصوص استخدام واضحة ووسوم تسهّل
                    العثور على المطلوب.
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-6 sm:px-6 lg:px-8">
          <div className="scrollbar-none flex gap-3 overflow-x-auto pb-2">
            {categoriesWithAll.map((category) => (
              <button
                key={category.slug}
                type="button"
                onClick={() => setActiveCategory(category.slug)}
                className={`whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-medium transition ${
                  activeCategory === category.slug
                    ? 'border-olive bg-olive text-white'
                    : 'border-white/70 bg-white/80 text-slate-600 hover:border-bronze/20 hover:text-ink'
                }`}
              >
                {category.name_ar}
              </button>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          {loading && (
            <div className="rounded-[28px] border border-dashed border-bronze/25 bg-white/70 p-6 text-center text-slate-600">
              جاري تحميل البرومبتات...
            </div>
          )}

          {error && (
            <div className="mb-8 rounded-[28px] border border-bronze/15 bg-[#fff8ef] p-5 text-sm leading-7 text-slate-700">
              {error}
            </div>
          )}

          {!loading && filteredPrompts.length === 0 && (
            <div className="rounded-[28px] border border-white/70 bg-white/80 p-8 text-center shadow-soft">
              <h3 className="mb-2 text-xl font-semibold text-ink">لا توجد نتائج مطابقة</h3>
              <p className="text-slate-600">جرّب تغيير عبارة البحث أو العودة إلى تبويب "الكل".</p>
            </div>
          )}

          <div className="space-y-12">
            {groupedPrompts.map(({ category, prompts: categoryPrompts }) => {
              if (categoryPrompts.length === 0) {
                return null;
              }

              return (
                <section
                  key={category.slug}
                  id={`category-${category.slug}`}
                  className="scroll-mt-28"
                >
                  <div className="mb-6 flex items-end justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-semibold text-ink sm:text-3xl">
                        {category.name_ar}
                      </h2>
                      <p className="mt-2 text-sm text-slate-500">
                        {categoryPrompts.length} برومبت في هذا التصنيف
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveCategory(category.slug)}
                      className="rounded-full border border-bronze/20 bg-white/80 px-4 py-2 text-sm font-medium text-bronze transition hover:bg-bronze hover:text-white"
                    >
                      عرض التصنيف فقط
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
                    {categoryPrompts.map((prompt) => (
                      <PromptCard
                        key={prompt.id}
                        prompt={prompt}
                        categoryName={category.name_ar}
                        isCopied={copiedId === prompt.id}
                        onCopy={handleCopy}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
