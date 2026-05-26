export type Category = {
  id: string;
  name_ar: string;
  slug: string;
  order: number;
};

export type PromptLanguage = 'ar' | 'en';

export type PromptPlaceholder = {
  key: string;
  label: string;
  description: string;
  defaultValue?: string;
};

export type PromptItem = {
  id: string;
  primary_language: PromptLanguage;
  title_ar: string;
  prompt_ar: string;
  usage: string;
  title_en: string;
  prompt_en: string;
  usage_en: string;
  placeholders: PromptPlaceholder[];
  category: string;
  tags: string[];
  created_at: string;
};
