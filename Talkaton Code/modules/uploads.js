import { createId } from "./storage.js";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "json"]);
const CODE_EXTENSIONS = new Set([
  "html", "htm", "css", "scss", "sass", "less",
  "js", "mjs", "cjs", "jsx", "ts", "tsx",
  "vue", "svelte", "astro",
  "py", "pyw", "java", "c", "cc", "cpp", "cxx", "h", "hpp",
  "cs", "go", "rs", "rb", "php", "swift", "kt", "kts", "dart",
  "lua", "r", "scala",
  "sh", "bash", "zsh", "fish", "ps1", "bat", "cmd",
  "sql", "graphql", "gql",
  "xml", "svg", "yaml", "yml", "toml", "ini", "cfg", "conf", "env",
  "log", "ipynb"
]);
const CODE_FILENAMES = new Set(["dockerfile", "makefile", "procfile", "gemfile"]);
const CODE_MIME_TYPES = new Set([
  "application/javascript",
  "application/ld+json",
  "application/sql",
  "application/typescript",
  "application/x-httpd-php",
  "application/x-javascript",
  "application/xml",
  "application/yaml",
  "text/javascript",
  "text/typescript",
  "text/x-python",
  "text/x-shellscript"
]);
const WORD_EXTENSIONS = new Set(["doc", "docx"]);
const SHEET_EXTENSIONS = new Set(["xls", "xlsx"]);
const MAX_FILE_SIZE = 18 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 240_000;
const MAX_FOLDER_FILES = 200;
const MAX_FOLDER_DISCOVERED_FILES = 500;
const MAX_FOLDER_FILE_SIZE = 2 * 1024 * 1024;
const SKIPPED_FOLDER_SEGMENTS = new Set([
  ".git", ".next", ".nuxt", ".svelte-kit", "build", "coverage",
  "dist", "node_modules", "target", "vendor"
]);

export const ACCEPTED_FILE_LABEL = "PDF, Word, spreadsheets, text, JSON, or common code files";

export async function prepareFiles(fileList, onProgress = () => {}) {
  const files = [...fileList];
  const prepared = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    onProgress(file, 5, index);
    const attachment = await prepareFile(file, progress => onProgress(file, progress, index));
    prepared.push(attachment);
  }

  return prepared;
}

export async function prepareFolder(fileList, onProgress = () => {}) {
  const allFiles = [...fileList];
  const discovered = allFiles
    .slice(0, MAX_FOLDER_DISCOVERED_FILES)
    .map(file => ({ file, path: getRelativePath(file) }))
    .filter(({ path }) => !hasSkippedPathSegment(path))
    .sort((a, b) => a.path.localeCompare(b.path));
  const candidates = discovered
    .filter(({ file }) => isReadableFolderFile(file))
    .slice(0, MAX_FOLDER_FILES);

  if (!candidates.length) throw new Error("That folder does not contain supported files.");

  const rootName = getFolderName(candidates);
  const sections = [];
  const tree = discovered.map(({ path }) => path);
  let includedCount = 0;
  let skippedCount = Math.max(0, allFiles.length - candidates.length);
  let usedCharacters = 0;

  for (let index = 0; index < candidates.length; index += 1) {
    const { file, path } = candidates[index];
    const progress = Math.round(((index + 1) / candidates.length) * 90);
    onProgress(file, Math.max(5, progress), index);

    try {
      const extension = getExtension(file.name);
      const isText = TEXT_EXTENSIONS.has(extension)
        || isCodeFile(file, extension)
        || file.type.startsWith("text/");
      let content = "";
      if (isText) {
        content = await file.text();
      } else {
        const prepared = await prepareFile(file, () => {});
        content = prepared.extractedText || "";
      }

      const header = `\n\n--- File: ${path} ---\n`;
      const remaining = MAX_EXTRACTED_CHARS - usedCharacters - header.length;
      if (remaining <= 0) {
        skippedCount += candidates.length - index;
        break;
      }

      const section = `${header}${content.slice(0, remaining)}`;
      sections.push(section);
      usedCharacters += section.length;
      includedCount += 1;
    } catch {
      skippedCount += 1;
    }
  }

  if (!includedCount) {
    throw new Error("That folder has no readable text, code, Word, or spreadsheet files.");
  }

  const treeText = tree.slice(0, MAX_FOLDER_FILES).join("\n");
  const summary = [
    `Folder: ${rootName}`,
    `Readable files included: ${includedCount}`,
    `Files skipped: ${skippedCount}`,
    "",
    "File tree:",
    treeText,
    "",
    "File contents:"
  ].join("\n");
  const extractedText = `${summary}${sections.join("")}`.slice(0, MAX_EXTRACTED_CHARS);

  onProgress(candidates.at(-1)?.file, 100, candidates.length - 1);
  return {
    id: createId("attachment"),
    name: `${rootName}/`,
    size: allFiles.reduce((total, file) => total + file.size, 0),
    type: "application/x-directory",
    extension: "",
    kind: "folder",
    extractedText,
    fileCount: includedCount,
    skippedCount,
    progress: 100,
    status: "ready"
  };
}

async function prepareFile(file, onProgress) {
  if (file.size > MAX_FILE_SIZE) throw new Error(`${file.name} is larger than 18 MB.`);

  const extension = getExtension(file.name);
  const base = {
    id: createId("attachment"),
    name: file.name,
    size: file.size,
    type: file.type || typeFromExtension(extension),
    extension,
    progress: 0,
    status: "processing"
  };

  if (IMAGE_TYPES.has(file.type) || ["jpg", "jpeg", "png", "webp", "gif"].includes(extension)) {
    const compressed = await compressImage(file, onProgress);
    return { ...base, ...compressed, kind: "image", status: "ready", progress: 100 };
  }

  onProgress(25);

  if (extension === "pdf" || file.type === "application/pdf") {
    const dataUrl = await readAsDataUrl(file);
    onProgress(100);
    return { ...base, kind: "pdf", dataUrl, status: "ready", progress: 100 };
  }

  const isCode = isCodeFile(file, extension);

  if (TEXT_EXTENSIONS.has(extension) || isCode || file.type.startsWith("text/")) {
    const extractedText = (await file.text()).slice(0, MAX_EXTRACTED_CHARS);
    onProgress(100);
    return {
      ...base,
      kind: isCode ? "code" : "text",
      extractedText,
      status: "ready",
      progress: 100
    };
  }

  if (WORD_EXTENSIONS.has(extension)) {
    const result = await extractWord(file, extension);
    onProgress(100);
    return { ...base, kind: "document", ...result, status: "ready", progress: 100 };
  }

  if (SHEET_EXTENSIONS.has(extension)) {
    const extractedText = await extractWorkbook(file);
    onProgress(100);
    return { ...base, kind: "spreadsheet", extractedText, status: "ready", progress: 100 };
  }

  throw new Error(`${file.name} is not a supported file type.`);
}

function getExtension(name) {
  const value = String(name || "");
  return value.includes(".") ? value.split(".").pop().toLowerCase() : "";
}

function isCodeFile(file, extension) {
  return CODE_EXTENSIONS.has(extension)
    || CODE_FILENAMES.has(file.name.toLowerCase())
    || CODE_MIME_TYPES.has(file.type);
}

function isReadableFolderFile(file) {
  if (file.size > MAX_FOLDER_FILE_SIZE) return false;
  const extension = getExtension(file.name);
  return TEXT_EXTENSIONS.has(extension)
    || isCodeFile(file, extension)
    || file.type.startsWith("text/")
    || extension === "docx"
    || SHEET_EXTENSIONS.has(extension);
}

function getRelativePath(file) {
  return String(file.webkitRelativePath || file.talkatonRelativePath || file.name)
    .replaceAll("\\", "/")
    .replace(/^\/+/, "");
}

function hasSkippedPathSegment(path) {
  return path.split("/").some(segment => SKIPPED_FOLDER_SEGMENTS.has(segment.toLowerCase()));
}

function getFolderName(candidates) {
  const roots = new Set(
    candidates
      .map(({ path }) => path.split("/")[0])
      .filter(Boolean)
  );
  return roots.size === 1 && candidates[0].path.includes("/")
    ? [...roots][0]
    : "Uploaded folder";
}

async function compressImage(file, onProgress) {
  onProgress(20);
  const sourceUrl = URL.createObjectURL(file);

  try {
    if (file.type === "image/gif") {
      const dataUrl = await readAsDataUrl(file);
      onProgress(100);
      return { dataUrl, previewUrl: dataUrl, originalSize: file.size };
    }

    const image = await loadImage(sourceUrl);
    const maxDimension = 1800;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    onProgress(50);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.84);
    const output = blob.size < file.size ? blob : file;
    const dataUrl = await readAsDataUrl(output);
    onProgress(100);

    return {
      dataUrl,
      previewUrl: dataUrl,
      size: output.size,
      type: output.type,
      originalSize: file.size
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function extractWord(file, extension) {
  const arrayBuffer = await file.arrayBuffer();

  if (extension === "docx") {
    try {
      const module = await import("https://esm.sh/mammoth@1.9.1/mammoth.browser?bundle");
      const mammoth = module.default || module;
      const result = await mammoth.extractRawText({ arrayBuffer });
      return { extractedText: result.value.slice(0, MAX_EXTRACTED_CHARS) };
    } catch (error) {
      console.warn("Word extraction fallback:", error);
    }
  }

  return {
    dataUrl: arrayBufferToDataUrl(arrayBuffer, file.type || "application/msword"),
    extractedText: `[Attached Word document: ${file.name}. Read and summarize the attached file.]`
  };
}

async function extractWorkbook(file) {
  const module = await import("https://esm.sh/xlsx@0.18.5?bundle");
  const XLSX = module.default || module;
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", dense: true });
  const sections = workbook.SheetNames.slice(0, 20).map(name => {
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name], { blankrows: false });
    return `## Sheet: ${name}\n${csv}`;
  });
  return sections.join("\n\n").slice(0, MAX_EXTRACTED_CHARS);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("This image could not be decoded."));
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Image compression failed.")), type, quality);
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function arrayBufferToDataUrl(arrayBuffer, type) {
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${type};base64,${btoa(binary)}`;
}

function typeFromExtension(extension) {
  const knownType = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    md: "text/markdown",
    markdown: "text/markdown",
    csv: "text/csv",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    json: "application/json",
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "text/javascript",
    mjs: "text/javascript",
    cjs: "text/javascript",
    jsx: "text/jsx",
    ts: "text/typescript",
    tsx: "text/tsx",
    xml: "application/xml",
    svg: "image/svg+xml",
    yaml: "application/yaml",
    yml: "application/yaml"
  }[extension];

  if (knownType) return knownType;
  return CODE_EXTENSIONS.has(extension) ? "text/plain" : "application/octet-stream";
}

export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** index);
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function attachmentGlyph(attachment) {
  if (attachment.kind === "folder") return "DIR";
  if (attachment.kind === "pdf") return "PDF";
  if (attachment.kind === "spreadsheet") return "XLS";
  if (attachment.kind === "document") return "DOC";
  if (attachment.kind === "code") {
    return {
      html: "HTML",
      htm: "HTML",
      css: "CSS",
      js: "JS",
      mjs: "JS",
      cjs: "JS",
      jsx: "JSX",
      ts: "TS",
      tsx: "TSX",
      py: "PY",
      sql: "SQL"
    }[attachment.extension] || "</>";
  }
  if (attachment.extension === "json") return "{}";
  if (attachment.extension === "csv") return "CSV";
  if (attachment.kind === "text") return "TXT";
  return "FILE";
}
