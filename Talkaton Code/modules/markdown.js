import { marked } from "https://esm.sh/marked@16.1.2";
import DOMPurify from "https://esm.sh/dompurify@3.2.6";
import hljs from "https://esm.sh/highlight.js@11.11.1/lib/common";
import katex from "https://esm.sh/katex@0.16.22";

marked.setOptions({
  gfm: true,
  breaks: true,
  async: false
});

const cache = new Map();
const CACHE_LIMIT = 80;

export function renderRichMarkdown(container, source, { streaming = false } = {}) {
  const text = String(source || "");
  let html = !streaming ? cache.get(text) : null;

  if (!html) {
    html = DOMPurify.sanitize(marked.parse(text), {
      USE_PROFILES: { html: true },
      ADD_ATTR: ["target", "rel", "aria-label"]
    });
    if (!streaming) remember(text, html);
  }

  if (container._talkatonRenderedSource !== text) {
    container.innerHTML = html;
    container._talkatonRenderedSource = text;
  }

  // Code controls are lightweight and remain useful while the response streams.
  enhanceCodeBlocks(container);

  // Keep streaming responsive by deferring expensive highlighting and math layout.
  if (streaming) return;

  container.querySelectorAll("a[href]").forEach(link => {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  });

  container.querySelectorAll("pre code").forEach(block => {
    if (!block.dataset.highlighted) hljs.highlightElement(block);
  });

  renderMath(container);
}

function remember(source, html) {
  cache.set(source, html);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}

function renderMath(container) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const parent = walker.currentNode.parentElement;
    if (!parent?.closest("code, pre, .katex")) nodes.push(walker.currentNode);
  }

  for (const node of nodes) {
    const value = node.nodeValue;
    if (!value?.includes("$")) continue;
    const pattern = /(\$\$[\s\S]+?\$\$|\$(?!\s)(?:\\.|[^$\n])+?\$)/g;
    if (!pattern.test(value)) continue;
    pattern.lastIndex = 0;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    while ((match = pattern.exec(value))) {
      fragment.append(document.createTextNode(value.slice(lastIndex, match.index)));
      const displayMode = match[0].startsWith("$$");
      const expression = match[0].slice(displayMode ? 2 : 1, displayMode ? -2 : -1);
      const wrapper = document.createElement(displayMode ? "div" : "span");
      wrapper.className = displayMode ? "mathBlock" : "mathInline";
      try {
        katex.render(expression, wrapper, { displayMode, throwOnError: false, trust: false, strict: "ignore" });
      } catch {
        wrapper.textContent = match[0];
      }
      fragment.append(wrapper);
      lastIndex = pattern.lastIndex;
    }
    fragment.append(document.createTextNode(value.slice(lastIndex)));
    node.replaceWith(fragment);
  }
}

function enhanceCodeBlocks(container) {
  container.querySelectorAll("pre").forEach(pre => {
    if (pre.parentElement?.classList.contains("codeBlock")) return;
    const code = pre.querySelector("code");
    const languageClass = [...(code?.classList || [])].find(name => name.startsWith("language-"));
    const language = languageClass?.replace("language-", "") || "code";
    const wrapper = document.createElement("div");
    wrapper.className = "codeBlock";
    const header = document.createElement("div");
    header.className = "codeHeader";
    header.innerHTML = `<span>${escapeText(language)}</span><button type="button" data-copy-code aria-label="Copy ${escapeText(language)} code">Copy</button>`;
    pre.before(wrapper);
    wrapper.append(header, pre);
  });
}

function escapeText(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}
