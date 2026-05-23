import { fallbackCategories, fallbackPrompts } from '../data/fallbackPrompts';
import { hasSupabaseEnv, supabase } from './supabase';
import type { Category, PromptItem } from '../types';

const STORAGE_KEY = 'prompty-admin-store';

type StoredLibrary = {
  categories: Category[];
  prompts: PromptItem[];
};

export type CategoryInput = Pick<Category, 'name_ar' | 'slug' | 'order'>;
export type PromptInput = Pick<
  PromptItem,
  'title_ar' | 'prompt_ar' | 'category' | 'usage' | 'tags'
>;

function sortCategories(categories: Category[]) {
  return [...categories].sort((a, b) => a.order - b.order);
}

function sortPrompts(prompts: PromptItem[]) {
  return [...prompts].sort((a, b) => {
    const aTime = Date.parse(a.created_at || '') || 0;
    const bTime = Date.parse(b.created_at || '') || 0;
    return bTime - aTime;
  });
}

function buildFallbackLibrary(): StoredLibrary {
  return {
    categories: sortCategories(fallbackCategories),
    prompts: sortPrompts(fallbackPrompts),
  };
}

function readLocalLibrary(): StoredLibrary {
  if (typeof window === 'undefined') {
    return buildFallbackLibrary();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    const fallbackLibrary = buildFallbackLibrary();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallbackLibrary));
    return fallbackLibrary;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredLibrary>;
    return {
      categories: sortCategories(parsed.categories ?? fallbackCategories),
      prompts: sortPrompts(parsed.prompts ?? fallbackPrompts),
    };
  } catch {
    return buildFallbackLibrary();
  }
}

function writeLocalLibrary(library: StoredLibrary) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      categories: sortCategories(library.categories),
      prompts: sortPrompts(library.prompts),
    }),
  );
}

export async function fetchLibrary() {
  if (!supabase || !hasSupabaseEnv) {
    return {
      ...readLocalLibrary(),
      source: 'local' as const,
      error: 'يتم استخدام التخزين المحلي لأن إعدادات Supabase غير متوفرة حالياً.',
    };
  }

  const [{ data: categoryRows, error: categoryError }, { data: promptRows, error: promptError }] =
    await Promise.all([
      supabase.from('categories').select('*').order('order', { ascending: true }),
      supabase.from('prompts').select('*').order('created_at', { ascending: false }),
    ]);

  if (categoryError || promptError) {
    return {
      ...buildFallbackLibrary(),
      source: 'fallback' as const,
      error: 'تعذر جلب البيانات من Supabase، لذلك يتم عرض بيانات بديلة حالياً.',
    };
  }

  return {
    categories: sortCategories(categoryRows ?? fallbackCategories),
    prompts: sortPrompts(promptRows ?? fallbackPrompts),
    source: 'supabase' as const,
    error: null,
  };
}

export async function createCategory(input: CategoryInput) {
  if (!supabase || !hasSupabaseEnv) {
    const library = readLocalLibrary();
    const nextCategory: Category = {
      id: crypto.randomUUID(),
      ...input,
    };

    writeLocalLibrary({
      ...library,
      categories: [...library.categories, nextCategory],
    });

    return nextCategory;
  }

  const { data, error } = await supabase
    .from('categories')
    .insert(input)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Category;
}

export async function updateCategory(categoryId: string, input: CategoryInput) {
  if (!supabase || !hasSupabaseEnv) {
    const library = readLocalLibrary();
    const previousCategory = library.categories.find((category) => category.id === categoryId);

    if (!previousCategory) {
      throw new Error('التصنيف غير موجود.');
    }

    const updatedCategories = library.categories.map((category) =>
      category.id === categoryId ? { ...category, ...input } : category,
    );

    const updatedPrompts = library.prompts.map((prompt) =>
      prompt.category === previousCategory.slug
        ? { ...prompt, category: input.slug }
        : prompt,
    );

    writeLocalLibrary({
      categories: updatedCategories,
      prompts: updatedPrompts,
    });

    return updatedCategories.find((category) => category.id === categoryId)!;
  }

  const { data, error } = await supabase
    .from('categories')
    .update(input)
    .eq('id', categoryId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Category;
}

export async function deleteCategory(categoryId: string) {
  if (!supabase || !hasSupabaseEnv) {
    const library = readLocalLibrary();
    const category = library.categories.find((item) => item.id === categoryId);

    if (!category) {
      throw new Error('التصنيف غير موجود.');
    }

    const categoryHasPrompts = library.prompts.some((prompt) => prompt.category === category.slug);

    if (categoryHasPrompts) {
      throw new Error('احذف البرومبتات التابعة لهذا التصنيف أولاً.');
    }

    writeLocalLibrary({
      ...library,
      categories: library.categories.filter((item) => item.id !== categoryId),
    });

    return;
  }

  const { error } = await supabase.from('categories').delete().eq('id', categoryId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function createPrompt(input: PromptInput) {
  if (!supabase || !hasSupabaseEnv) {
    const library = readLocalLibrary();
    const nextPrompt: PromptItem = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      ...input,
    };

    writeLocalLibrary({
      ...library,
      prompts: [nextPrompt, ...library.prompts],
    });

    return nextPrompt;
  }

  const { data, error } = await supabase
    .from('prompts')
    .insert(input)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as PromptItem;
}

export async function updatePrompt(promptId: string, input: PromptInput) {
  if (!supabase || !hasSupabaseEnv) {
    const library = readLocalLibrary();
    const updatedPrompts = library.prompts.map((prompt) =>
      prompt.id === promptId ? { ...prompt, ...input } : prompt,
    );

    writeLocalLibrary({
      ...library,
      prompts: updatedPrompts,
    });

    return updatedPrompts.find((prompt) => prompt.id === promptId)!;
  }

  const { data, error } = await supabase
    .from('prompts')
    .update(input)
    .eq('id', promptId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as PromptItem;
}

export async function deletePrompt(promptId: string) {
  if (!supabase || !hasSupabaseEnv) {
    const library = readLocalLibrary();

    writeLocalLibrary({
      ...library,
      prompts: library.prompts.filter((prompt) => prompt.id !== promptId),
    });

    return;
  }

  const { error } = await supabase.from('prompts').delete().eq('id', promptId);

  if (error) {
    throw new Error(error.message);
  }
}
