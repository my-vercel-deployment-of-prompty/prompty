import { Check, Copy } from 'lucide-react';
import type { PromptItem } from '../types';

type PromptCardProps = {
  prompt: PromptItem;
  categoryName: string;
  isCopied: boolean;
  onCopy: (promptText: string, promptId: string) => void;
};

export function PromptCard({
  prompt,
  categoryName,
  isCopied,
  onCopy,
}: PromptCardProps) {
  return (
    <article className="group flex h-full flex-col rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-soft backdrop-blur transition duration-300 hover:-translate-y-1 hover:shadow-[0_26px_60px_rgba(36,27,20,0.14)] sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="rounded-full bg-sand px-3 py-1 text-xs font-semibold text-bronze">
          {categoryName}
        </span>
        <button
          type="button"
          onClick={() => onCopy(prompt.prompt_ar, prompt.id)}
          className="inline-flex items-center gap-2 rounded-full border border-bronze/20 bg-bronze/5 px-3 py-2 text-sm font-medium text-bronze transition hover:bg-bronze hover:text-white"
        >
          {isCopied ? <Check size={16} /> : <Copy size={16} />}
          <span>{isCopied ? 'تم النسخ' : 'نسخ البرومبت'}</span>
        </button>
      </div>

      <h3 className="mb-3 text-xl font-semibold leading-8 text-ink">{prompt.title_ar}</h3>

      <p className="mb-4 rounded-[22px] bg-[#fcfaf5] p-4 text-sm leading-8 text-slate-700">
        {prompt.prompt_ar}
      </p>

      <p className="mb-4 text-sm leading-7 text-slate-600">
        <span className="font-semibold text-ink">الاستخدام:</span> {prompt.usage}
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
