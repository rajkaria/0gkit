"use client";

import { useState } from "react";
import {
  CODE_FORMS,
  formLabel,
  generateCode,
  type Action,
  type CodeForm,
  type CodegenInput,
} from "@/lib/codegen";

export function CodeTabs({ action, input }: { action: Action; input: CodegenInput }) {
  const [form, setForm] = useState<CodeForm>("cli");
  const [copied, setCopied] = useState(false);
  const code = generateCode(action, form, input);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      /* clipboard blocked (e.g. headless) — the <pre> still shows the code */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div
      data-testid={`codetabs-${action}`}
      className="mt-4 overflow-hidden rounded-lg border border-white/10"
    >
      <div className="flex items-center gap-1 border-b border-white/10 bg-white/5 px-2 py-1">
        {CODE_FORMS.map((f) => (
          <button
            key={f}
            type="button"
            data-testid={`tab-${action}-${f}`}
            aria-pressed={f === form}
            onClick={() => setForm(f)}
            className={`rounded px-2 py-1 text-xs ${
              f === form ? "bg-white/15 text-white" : "text-white/60 hover:text-white"
            }`}
          >
            {formLabel(f)}
          </button>
        ))}
        <button
          type="button"
          data-testid={`copy-${action}`}
          onClick={copy}
          className="ml-auto rounded px-2 py-1 text-xs text-white/70 hover:text-white"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        data-testid={`code-${action}`}
        className="overflow-x-auto p-3 text-xs leading-relaxed text-white/90"
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
