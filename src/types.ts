export type Category = {
  id: string;
  name_ar: string;
  slug: string;
  order: number;
};

export type PromptPlaceholder = {
  key: string;
  label: string;
  description: string;
  defaultValue?: string;
};

export type PromptItem = {
  id: string;
  title_ar: string;
  prompt_ar: string;
  placeholders: PromptPlaceholder[];
  category: string;
  usage: string;
  tags: string[];
  created_at: string;
};
