<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    data?: unknown;
    maxHeight?: string;
    copyable?: boolean;
    title?: string;
  }>(),
  {
    data: undefined,
    maxHeight: "360px",
    copyable: true,
    title: "JSON PAYLOAD",
  },
);

const formattedJson = computed<string>(() => {
  if (props.data === undefined || props.data === null) {
    return "null";
  }
  if (typeof props.data === "string") {
    try {
      const parsed = JSON.parse(props.data);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return props.data;
    }
  }
  try {
    return JSON.stringify(props.data, null, 2);
  } catch {
    return String(props.data);
  }
});

interface Token {
  text: string;
  type: "key" | "string" | "number" | "boolean" | "null" | "punctuation" | "plain";
}

const tokens = computed<Token[]>(() => {
  const json = formattedJson.value;
  // Tokenize JSON safely without eval
  const tokenList: Token[] = [];
  const regex =
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|[{}[\],:])/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(json);

  while (match !== null) {
    if (match.index > lastIndex) {
      tokenList.push({
        text: json.slice(lastIndex, match.index),
        type: "plain",
      });
    }

    const matchText = match[0];
    let type: Token["type"] = "plain";

    if (/^"/.test(matchText)) {
      if (/:$/.test(matchText)) {
        type = "key";
      } else {
        type = "string";
      }
    } else if (/true|false/.test(matchText)) {
      type = "boolean";
    } else if (/null/.test(matchText)) {
      type = "null";
    } else if (/[{}[\]:,]/.test(matchText)) {
      type = "punctuation";
    } else if (!Number.isNaN(Number(matchText))) {
      type = "number";
    }

    tokenList.push({ text: matchText, type });
    lastIndex = regex.lastIndex;
    match = regex.exec(json);
  }

  if (lastIndex < json.length) {
    tokenList.push({ text: json.slice(lastIndex), type: "plain" });
  }

  return tokenList;
});

function getTokenClass(type: Token["type"]): string {
  switch (type) {
    case "key":
      return "text-text-primary font-semibold";
    case "string":
      return "text-status-operational";
    case "number":
      return "text-amber-400";
    case "boolean":
      return "text-indigo-400 font-bold";
    case "null":
      return "text-text-muted italic";
    case "punctuation":
      return "text-text-secondary";
    default:
      return "text-text-primary";
  }
}
</script>

<template>
  <div class="border border-hairline bg-canvas-subtle font-mono text-xs rounded-none transition-colors">
    <div class="flex items-center justify-between px-3 py-2 border-b border-hairline bg-surface">
      <div class="text-[11px] font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
        <span class="text-text-muted">{</span>
        <span>{{ title }}</span>
        <span class="text-text-muted">}</span>
      </div>

      <div v-if="copyable && formattedJson">
        <CopyButton :text="formattedJson" label="COPY JSON" size="xs" />
      </div>
    </div>

    <pre
      class="p-3 overflow-x-auto overflow-y-auto leading-relaxed select-text m-0 whitespace-pre font-mono text-xs"
      :style="{ maxHeight: maxHeight }"
    ><code><span
      v-for="(tok, idx) in tokens"
      :key="idx"
      :class="getTokenClass(tok.type)"
    >{{ tok.text }}</span></code></pre>
  </div>
</template>
