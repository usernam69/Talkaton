import { createId, getVisitorId, loadStoredState, saveStoredState } from "./modules/storage.js";
import {
  ACCEPTED_FILE_LABEL,
  attachmentGlyph,
  formatFileSize,
  prepareFiles,
  prepareFolder
} from "./modules/uploads.js?v=20260724-folder-uploads";
import { isMessageSubmitKey } from "./modules/keyboard.js";

const CONFIG = {
  SUPABASE_URL: "https://cxulgeojkjnskdyoktkj.supabase.co",
  SUPABASE_KEY: "sb_publishable_GgxtfIaIamzZFY_jMU4_Cw_V8NKm475",
  CHAT_API: "/api/chat",
  SEARCH_API: "/api/search",
  IMAGE_API: "/api/image",
  MAX_MEMORY: 100,
  INITIAL_CHAT_BATCH: 30,
  CHAT_BATCH_SIZE: 25,
  DAILY_LIMITS: {
    guest: 25,
    free: 45,
    unlimitedEmails: ["kantertal1@gmail.com"]
  },
  IMAGE_DAILY_LIMITS: {
    guest: 5,
    free: 10,
    unlimitedEmails: ["kantertal1@gmail.com"]
  },
  SEARCH_DAILY_LIMITS: {
    guest: 5,
    free: 15,
    unlimitedEmails: ["kantertal1@gmail.com"]
  }
};

const MODEL_NAMES = {
  "openai/gpt-5.4-nano": "GPT-5.4 Nano",
  "openai/gpt-4.1-mini": "GPT-4.1 Mini",
  "anthropic/claude-3-haiku": "Claude 3 Haiku",
  "google/gemini-2.5-flash-lite": "Gemini",
  "deepseek/deepseek-chat": "DeepSeek Chat",
  "meta-llama/llama-3.1-8b-instruct": "Llama 3.1 8B",
  "mistralai/mistral-small-3.1-24b-instruct": "Mistral Small"
};

const FREE_MODELS = new Set([
  "openai/gpt-5.4-nano",
  "deepseek/deepseek-chat"
]);

const MODEL_ALIASES = {
  "google/gemini-pro": "google/gemini-2.5-flash-lite"
};

const defaultState = {
  user: null,
  loggedIn: false,
  chats: [],
  currentChatId: null,
  memory: [],
  loading: false,
  mode: "Normal",
  model: "openai/gpt-5.4-nano",
  settings: {
    voice: true,
    markdown: true,
    memory: true,
    timestamps: false,
    autoScroll: true,
    theme: "system",
    speechRate: 1,},
  sidebarCollapsed: false,
  pendingAttachments: [],
  dailyMessageCount: 0,
  dailyMessageDate: null,
  dailyImageCount: 0,
  dailyImageDate: null,
  dailySearchCount: 0,
  dailySearchDate: null
};

let state = loadStoredState(defaultState);
state.pendingAttachments = [];
let abortController = null;
let markdownModulePromise = null;
let renderFrame = null;
let renderTimer = null;
let lastStreamingPaint = 0;
let textareaResizeFrame = null;
let chatSearchTimer = null;
let persistTimer = null;
let persistIdleHandle = null;
let visibleChatCount = CONFIG.INITIAL_CHAT_BATCH;
let userPausedScroll = false;
let lastChatScrollTop = 0;
let touchScrollY = null;
let dragDepth = 0;
let activePromptResolver = null;
let recognition = null;
let searchMode = false;
let authMode = "signIn";
let passwordRecoveryPending = false;
let loginConfirmationPending = false;
let signupConfirmationPending = false;
let pendingProfileAvatar = "";

let supabasePromise = null;

const STREAM_PAINT_INTERVAL = 80;

const DOM = {
  app: byId("app"),
  main: byId("main"),
  sidebar: byId("sidebar"),
  sidebarBackdrop: byId("sidebarBackdrop"),
  sidebarCloseBtn: byId("sidebarCloseBtn"),
  sidebarCollapseBtn: byId("sidebarCollapseBtn"),
  menuBtn: byId("menuBtn"),
  chatArea: byId("chatArea"),
  chatViewport: byId("chatViewport"),
  input: byId("messageInput"),
  composer: byId("composer"),
  composerDock: byId("composerDock"),
  sendBtn: byId("sendBtn"),
  toolsBtn: byId("toolsBtn"),
  newChatBtn: byId("newChatBtn"),
  chatList: byId("chatList"),
  chatListSentinel: byId("chatListSentinel"),
  chatSearchInput: byId("chatSearchInput"),
  loginBtn: byId("loginBtn"),
  modeSelect: byId("modeSelect"),
  modelSelect: byId("modelSelect"),
  searchBtn: byId("searchBtn"),
  imageGenerateBtn: byId("imageGenerateBtn"),
  imageUploadBtn: byId("imageUploadBtn"),
  attachmentBtn: byId("attachmentBtn"),
  voiceBtn: byId("voiceBtn"),
  memoryBtn: byId("memoryBtn"),
  settingsBtn: byId("settingsBtn"),
  themeBtn: byId("themeBtn"),
  clearChatBtn: byId("clearChatBtn"),
  messageCounter: byId("messageCounter"),
  visitorCount: byId("visitorCount"),
  memoryCount: byId("memoryCount"),
  conversationTitle: byId("conversationTitle"),
  connectionStatus: byId("connectionStatus"),
  offlineBanner: byId("offlineBanner"),
  charCount: byId("charCount"),
  scrollBottomBtn: byId("scrollBottomBtn"),
  imageInput: byId("imageInput"),
  fileInput: byId("fileInput"),
  folderInput: byId("folderInput"),
  attachmentTray: byId("attachmentTray"),
  dropOverlay: byId("dropOverlay"),
  toastRegion: byId("toastRegion"),
  announcer: byId("announcer"),
  settingsDialog: byId("settingsDialog"),
  memoryDialog: byId("memoryDialog"),
  memoryContent: byId("memoryContent"),
  authDialog: byId("authDialog"),
  authForm: byId("authForm"),
  authEyebrow: byId("authEyebrow"),
  authTitle: byId("authTitle"),
  authIntro: byId("authIntro"),
  signInTab: byId("signInTab"),
  signUpTab: byId("signUpTab"),
  authEmail: byId("authEmail"),
  authPassword: byId("authPassword"),
  authConfirmPasswordField: byId("authConfirmPasswordField"),
  authConfirmPassword: byId("authConfirmPassword"),
  authError: byId("authError"),
  authSubmitBtn: byId("authSubmitBtn"),
  forgotPasswordBtn: byId("forgotPasswordBtn"),
  profileDialog: byId("profileDialog"),
  profileForm: byId("profileForm"),
  profileAvatarInitial: byId("profileAvatarInitial"),
  profileAvatarImage: byId("profileAvatarImage"),
  profileImageInput: byId("profileImageInput"),
  profileUploadBtn: byId("profileUploadBtn"),
  profileRemoveBtn: byId("profileRemoveBtn"),
  profileUsername: byId("profileUsername"),
  profileEmail: byId("profileEmail"),
  profileError: byId("profileError"),
  profileLogoutBtn: byId("profileLogoutBtn"),
  profileSaveBtn: byId("profileSaveBtn"),
  profileDashboard: byId("profileDashboard"),
  passwordResetDialog: byId("passwordResetDialog"),
  passwordResetForm: byId("passwordResetForm"),
  newPassword: byId("newPassword"),
  confirmPassword: byId("confirmPassword"),
  passwordResetError: byId("passwordResetError"),
  promptDialog: byId("promptDialog"),
  promptForm: byId("promptForm"),
  promptEyebrow: byId("promptEyebrow"),
  promptTitle: byId("promptTitle"),
  promptLabel: byId("promptLabel"),
  promptInput: byId("promptInput"),
  promptSubmitBtn: byId("promptSubmitBtn"),
  promptCancelBtn: byId("promptCancelBtn"),
  promptCancelX: byId("promptCancelX"),
  toolsPopover: byId("toolsPopover")
};

let appInitialized = false;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp, { once: true });
} else {
  startApp();
}

function startApp() {
  if (appInitialized) return;
  appInitialized = true;
  init().catch(error => {
    appInitialized = false;
    console.error("Talkaton failed to initialize:", error);
    document.body.classList.add("appInitFailed");
  });
}

async function init() {
  normalizeState();
  bindEvents();
  applyPreferences();
  updateNetworkStatus();
  updateViewportHeight();
  renderAttachmentTray();
  renderChats();
  renderMessages();
  updateStats();
  updateMessageCounter();
  updateComposerState();
  updateVisitorCounter();
  setupChatPagination();
  requestAnimationFrame(() => DOM.app.classList.add("appReady"));

  await restoreSession();
  updateAccount();

  const preloadMarkdown = () => loadMarkdown().catch(() => {});
  if ("requestIdleCallback" in window) window.requestIdleCallback(preloadMarkdown, { timeout: 2500 });
  else setTimeout(preloadMarkdown, 1200);
}

function getUserTier() {
  if (state.loggedIn && state.user?.email) {
    const email = state.user.email.toLowerCase();
    if (CONFIG.DAILY_LIMITS.unlimitedEmails.includes(email)) return "dev";
    return "free";
  }
  return "guest";
}

function getDailyLimit() {
  const tier = getUserTier();
  if (tier === "dev") return Infinity;
  return CONFIG.DAILY_LIMITS[tier];
}

function resetDailyIfNewDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.dailyMessageDate !== today) {
    state.dailyMessageDate = today;
    state.dailyMessageCount = 0;
    persist();
  }
}

function canSendMessage() {
  resetDailyIfNewDay();
  return state.dailyMessageCount < getDailyLimit();
}

function incrementDailyCount() {
  resetDailyIfNewDay();
  state.dailyMessageCount += 1;
  persist();
  updateMessageCounter();
}

function getRemainingMessages() {
  resetDailyIfNewDay();
  const limit = getDailyLimit();
  if (!Number.isFinite(limit)) return "∞";
  return Math.max(0, limit - state.dailyMessageCount);
}

function getImageDailyLimit() {
  const tier = getUserTier();
  if (tier === "dev") return Infinity;
  return CONFIG.IMAGE_DAILY_LIMITS[tier];
}

function resetImageDailyIfNewDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.dailyImageDate !== today) {
    state.dailyImageDate = today;
    state.dailyImageCount = 0;
    persist();
  }
}

function canGenerateImage() {
  resetImageDailyIfNewDay();
  return state.dailyImageCount < getImageDailyLimit();
}

function incrementImageDailyCount() {
  resetImageDailyIfNewDay();
  state.dailyImageCount += 1;
  persist();
}

function getRemainingImages() {
  resetImageDailyIfNewDay();
  const limit = getImageDailyLimit();
  if (!Number.isFinite(limit)) return "∞";
  return Math.max(0, limit - state.dailyImageCount);
}

function getSearchDailyLimit() {
  const tier = getUserTier();
  if (tier === "dev") return Infinity;
  return CONFIG.SEARCH_DAILY_LIMITS[tier];
}

function resetSearchDailyIfNewDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.dailySearchDate !== today) {
    state.dailySearchDate = today;
    state.dailySearchCount = 0;
    persist();
  }
}

function canSearch() {
  resetSearchDailyIfNewDay();
  return state.dailySearchCount < getSearchDailyLimit();
}

function incrementSearchDailyCount() {
  resetSearchDailyIfNewDay();
  state.dailySearchCount += 1;
  persist();
}

function getRemainingSearches() {
  resetSearchDailyIfNewDay();
  const limit = getSearchDailyLimit();
  if (!Number.isFinite(limit)) return "∞";
  return Math.max(0, limit - state.dailySearchCount);
}

function detectSearchIntent(text) {
  const lower = text.toLowerCase().trim();
  const patterns = [
    /^(?:search|look\s*up|find|google|web\s*search|search\s*for|look\s*for)\s+(.+)/i,
    /^(?:what(?:'s| is| are) the (?:latest|newest|most recent|current|top))\s+(.+)/i,
    /^(?:who (?:is|are|was|were))\s+(.+)/i,
    /^(?:when (?:did|was|is|will))\s+(.+)/i,
    /^(?:where (?:is|are|can|do|did))\s+(.+)/i,
    /^(?:how (?:to|do|did|can|is|are))\s+(.+)/i,
    /^(?:tell me about|give me (?:info|information|details) on|what do you know about)\s+(.+)/i,
    /^(?:news|update|current events|what(?:'s| is) happening)\s*(?:about|in|on|with)?\s*(.*)/i
  ];
  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match) return match[1]?.trim() || text.trim();
  }
  return null;
}

function detectImageIntent(text) {
  const lower = text.toLowerCase().trim();
  const patterns = [
    /^(?:generate|create|make|draw|design|produce|build)\s+(?:an?\s+)?(?:image|picture|photo|illustration|artwork|drawing|pic)\s+(?:of|showing|with|featuring|depicting)?\s*(.+)/i,
    /^(?:image|picture|photo|illustration|artwork|drawing)\s+(?:of|showing|with|featuring|depicting)\s+(.+)/i,
    /^(?:can you|could you|please|would you)?\s*(?:generate|create|make|draw|design)\s+(?:an?\s+)?(?:image|picture|photo|illustration|artwork)\s+(?:of|showing|with|featuring|depicting)?\s*(.+)/i
  ];
  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match) return match[1]?.trim() || text.trim();
  }
  return null;
}

function normalizeState() {
  state.loading = false;
  state.settings = { ...defaultState.settings, ...(state.settings || {}) };
  state.model = MODEL_ALIASES[state.model] || state.model;
  if (!MODEL_NAMES[state.model]) state.model = defaultState.model;
  state.chats = (state.chats || []).map(chat => ({
    id: chat.id || createId("chat"),
    title: chat.title || "New chat",
    createdAt: chat.createdAt || Date.now(),
    updatedAt: chat.updatedAt || chat.createdAt || Date.now(),
    pinned: Boolean(chat.pinned),
    favorite: Boolean(chat.favorite),
    messages: Array.isArray(chat.messages)
      ? chat.messages.map(message => ({
        id: message.id || createId("message"),
        role: message.role === "user" ? "user" : "assistant",
        content: String(message.content || ""),
        timestamp: message.timestamp || Date.now(),
        model: message.model || (message.role === "assistant" ? state.model : undefined),
        status: message.status === "streaming" ? "stopped" : (message.status || "complete"),
        attachments: Array.isArray(message.attachments) ? message.attachments : [],
        generatedImage: message.generatedImage || ""
      }))
      : []
  }));

  if (!state.chats.length) {
    const chat = makeChat();
    state.chats = [chat];
    state.currentChatId = chat.id;
  }

  if (!state.chats.some(chat => chat.id === state.currentChatId)) {
    state.currentChatId = state.chats[0].id;
  }
}

function bindEvents() {
  DOM.composer.addEventListener("submit", handleComposerSubmit);
  if (typeof DOM.toolsPopover.showPopover !== "function") {
    DOM.toolsBtn.addEventListener("click", toggleToolsFallback);
  }
  DOM.newChatBtn.addEventListener("click", createChat);
  DOM.loginBtn.addEventListener("click", handleAuth);
  DOM.searchBtn.addEventListener("click", toggleSearchMode);
  DOM.imageGenerateBtn.addEventListener("click", generateImage);
  DOM.imageUploadBtn.addEventListener("click", () => DOM.imageInput.click());
  DOM.attachmentBtn.addEventListener("click", () => DOM.fileInput.click());
  DOM.voiceBtn.addEventListener("click", toggleVoiceInput);
  DOM.memoryBtn.addEventListener("click", openMemory);
  DOM.settingsBtn.addEventListener("click", openSettings);
  DOM.themeBtn.addEventListener("click", cycleTheme);
  DOM.clearChatBtn.addEventListener("click", clearConversation);
  DOM.sidebarCollapseBtn.addEventListener("click", toggleSidebarCollapse);
  DOM.menuBtn.addEventListener("click", openMobileSidebar);
  DOM.sidebarCloseBtn.addEventListener("click", closeMobileSidebar);
  DOM.sidebarBackdrop.addEventListener("click", closeMobileSidebar);
  DOM.scrollBottomBtn.addEventListener("click", () => scrollBottom({ behavior: "smooth", force: true }));
  DOM.imageInput.addEventListener("change", event => addFiles(event.target.files));
  DOM.fileInput.addEventListener("change", event => addFiles(event.target.files));
  DOM.folderInput.addEventListener("change", event => addFolder(event.target.files));
  DOM.chatSearchInput.addEventListener("input", scheduleChatSearchRender);

  DOM.input.addEventListener("input", () => {
    scheduleTextareaResize();
    updateComposerState();
  });
  DOM.input.addEventListener("keydown", handleComposerKeydown);
  DOM.modeSelect.addEventListener("change", event => {
    state.mode = event.target.value;
    persist();
  });
  DOM.modelSelect.addEventListener("change", event => {
    const tier = getUserTier();
    if (tier === "guest") {
      event.target.value = "openai/gpt-5.4-nano";
      toast("Guest accounts are limited to GPT-5.4 Nano. Sign up for more models.", "error");
      return;
    }
    if (tier === "free" && !FREE_MODELS.has(event.target.value)) {
      event.target.value = state.model;
      toast("Free plan includes GPT-5.4 Nano and DeepSeek. Upgrade for Claude, Llama, and more.", "error");
      return;
    }
    state.model = event.target.value;
    persist();
  });

  DOM.chatViewport.addEventListener("scroll", handleChatScroll, { passive: true });
  DOM.chatViewport.addEventListener("wheel", handleChatWheel, { passive: true });
  DOM.chatViewport.addEventListener("touchstart", handleChatTouchStart, { passive: true });
  DOM.chatViewport.addEventListener("touchmove", handleChatTouchMove, { passive: true });
  DOM.chatViewport.addEventListener("touchend", clearChatTouch, { passive: true });
  DOM.chatViewport.addEventListener("touchcancel", clearChatTouch, { passive: true });
  DOM.chatArea.addEventListener("click", handleChatAction);
  DOM.chatList.addEventListener("click", handleChatListAction);
  DOM.attachmentTray.addEventListener("click", handleAttachmentAction);

  document.addEventListener("keydown", handleGlobalShortcut);
  document.addEventListener("click", addRipple, { capture: true });
  document.addEventListener("click", handleDocumentClick);
  document.querySelectorAll("[data-close-dialog]").forEach(button => {
    button.addEventListener("click", () => byId(button.dataset.closeDialog)?.close());
  });

  byId("popoverImageUpload").addEventListener("click", () => {
    hideToolsPopover();
    DOM.imageInput.click();
  });
  byId("popoverFileUpload").addEventListener("click", () => {
    hideToolsPopover();
    DOM.fileInput.click();
  });
  byId("popoverFolderUpload").addEventListener("click", () => {
    hideToolsPopover();
    DOM.folderInput.click();
  });
  byId("popoverWebSearch").addEventListener("click", () => {
    hideToolsPopover();
    toggleSearchMode();
  });
  byId("generateImageBtn").addEventListener("click", () => {
    hideToolsPopover();
    generateImage();
  });
  DOM.toolsPopover.addEventListener("toggle", () => {
    DOM.toolsBtn.setAttribute("aria-expanded", String(DOM.toolsPopover.matches(":popover-open")));
  });

  DOM.settingsDialog.addEventListener("close", saveSettingsFromDialog);
  byId("themeSelect").addEventListener("change", saveSettingsFromDialog);
  byId("timestampsToggle").addEventListener("change", saveSettingsFromDialog);
  byId("autoScrollToggle").addEventListener("change", saveSettingsFromDialog);
  byId("memoryToggle").addEventListener("change", saveSettingsFromDialog);
  byId("markdownToggle").addEventListener("change", saveSettingsFromDialog);
  byId("voiceOutputToggle").addEventListener("change", saveSettingsFromDialog);
  byId("speechRateInput").addEventListener("input", saveSettingsFromDialog);

  DOM.authForm.addEventListener("submit", submitAuth);
  DOM.signInTab.addEventListener("click", () => setAuthMode("signIn"));
  DOM.signUpTab.addEventListener("click", () => setAuthMode("signUp"));
  DOM.forgotPasswordBtn.addEventListener("click", requestPasswordReset);
  DOM.profileForm.addEventListener("submit", saveProfile);
  DOM.profileUploadBtn.addEventListener("click", () => DOM.profileImageInput.click());
  DOM.profileImageInput.addEventListener("change", handleProfileImageSelection);
  DOM.profileRemoveBtn.addEventListener("click", removeProfileImage);
  DOM.profileLogoutBtn.addEventListener("click", logoutFromProfile);
  DOM.profileUsername.addEventListener("input", () => {
    renderProfileAvatar(DOM.profileUsername.value.trim() || getProfileName(state.user));
  });
  DOM.passwordResetForm.addEventListener("submit", submitPasswordReset);
  DOM.promptForm.addEventListener("submit", submitPromptDialog);
  DOM.promptCancelBtn.addEventListener("click", cancelPromptDialog);
  DOM.promptCancelX.addEventListener("click", cancelPromptDialog);
  DOM.promptDialog.addEventListener("cancel", event => {
    event.preventDefault();
    cancelPromptDialog();
  });

  window.addEventListener("online", updateNetworkStatus);
  window.addEventListener("offline", updateNetworkStatus);
  window.addEventListener("resize", updateViewportHeight, { passive: true });
  window.visualViewport?.addEventListener("resize", updateViewportHeight, { passive: true });
  const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handleSystemThemeChange = () => {
    if (state.settings.theme === "system") applyTheme();
  };
  if (typeof themeQuery.addEventListener === "function") {
    themeQuery.addEventListener("change", handleSystemThemeChange);
  } else {
    themeQuery.addListener?.(handleSystemThemeChange);
  }

  DOM.main.addEventListener("dragenter", handleDragEnter);
  DOM.main.addEventListener("dragover", handleDragOver);
  DOM.main.addEventListener("dragleave", handleDragLeave);
  DOM.main.addEventListener("drop", handleDrop);
  DOM.input.addEventListener("paste", handlePaste);
}

function makeChat() {
  return {
    id: createId("chat"),
    title: "New chat",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pinned: false,
    favorite: false,
    messages: []
  };
}

function getChat() {
  return state.chats.find(chat => chat.id === state.currentChatId);
}

function createChat() {
  if (state.loading) stopGeneration();
  const activeChat = getChat();
  if (activeChat?.messages.length === 0) {
    DOM.input.focus();
    closeMobileSidebar();
    return;
  }

  const chat = makeChat();
  state.chats.unshift(chat);
  state.currentChatId = chat.id;
  state.pendingAttachments = [];
  searchMode = false;
  DOM.input.value = "";
  visibleChatCount = CONFIG.INITIAL_CHAT_BATCH;
  persist();
  renderChats();
  renderMessages();
  renderAttachmentTray();
  updateComposerState();
  closeMobileSidebar();
  DOM.input.focus();
  announce("New chat created");
}

async function sendMessage(options = {}) {
  if (state.loading) return;

  const attachments = options.attachments ?? state.pendingAttachments;
  const enteredText = (options.text ?? DOM.input.value).trim();
  const text = enteredText || createAttachmentPrompt(attachments);
  if (!text || attachments.some(attachment => attachment.status !== "ready")) return;
  const chat = getChat();
  if (!chat) return;

  if (!options.hiddenUser && !canSendMessage()) {
    toast("You've reached your daily message limit. Upgrade or come back tomorrow.", "error");
    return;
  }

  if (searchMode && !options.bypassSearch && !attachments.length) {
    return sendSearchMessage(text);
  }

  if (getUserTier() === "guest" && state.model !== "openai/gpt-5.4-nano") {
    state.model = "openai/gpt-5.4-nano";
    DOM.modelSelect.value = state.model;
  }

  if (getUserTier() === "free" && !FREE_MODELS.has(state.model)) {
    state.model = "openai/gpt-5.4-nano";
    DOM.modelSelect.value = state.model;
  }

  const searchQuery = !options.hiddenUser && !options.bypassSearch ? detectSearchIntent(text) : null;
  const imagePrompt = !options.hiddenUser && !options.bypassSearch ? detectImageIntent(text) : null;

  let userMessage = options.userMessage;

  if (!options.hiddenUser && !userMessage) {
    userMessage = {
      id: createId("message"),
      role: "user",
      content: text,
      timestamp: Date.now(),
      status: "complete",
      attachments: attachments.map(stripAttachmentForMessage)
    };
    chat.messages.push(userMessage);
  }

  if (!options.hiddenUser) {
    DOM.input.value = "";
    state.pendingAttachments = [];
    renderAttachmentTray();
    resizeTextarea();
  }

  if (chat.title === "New chat" && !options.hiddenUser) {
    chat.title = createChatTitle(text);
  }

  chat.updatedAt = Date.now();
  state.loading = true;
  abortController = new AbortController();
  updateComposerState();
  renderChats();

  if (searchQuery) {
    if (!canSearch()) {
      toast("You've reached your daily web search limit. Upgrade or come back tomorrow.", "error");
      state.loading = false;
      abortController = null;
      updateComposerState();
      renderMessages();
      return;
    }

    const searchIndicator = {
      id: createId("message"),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      model: "Web search",
      status: "streaming",
      attachments: []
    };
    chat.messages.push(searchIndicator);
    renderMessages({ focusMessageId: searchIndicator.id });
    announce("Searching the web");

    try {
      const response = await fetch(CONFIG.SEARCH_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Search failed.");
      searchIndicator.content = data.answer || "No results found.";
      searchIndicator.searchResults = data.results || [];
      searchIndicator.status = "complete";
      incrementSearchDailyCount();
      if (!options.hiddenUser) incrementDailyCount();
    } catch (error) {
      searchIndicator.status = "error";
      searchIndicator.error = error.message || "Search failed.";
    }

    state.loading = false;
    abortController = null;
    chat.updatedAt = Date.now();
    persist();
    updateStats();
    updateComposerState();
    renderMessages();
    return;
  }

  if (imagePrompt) {
    if (!canGenerateImage()) {
      toast("You've reached your daily image limit. Upgrade or come back tomorrow.", "error");
      state.loading = false;
      abortController = null;
      updateComposerState();
      renderMessages();
      return;
    }

    const imageIndicator = {
      id: createId("message"),
      role: "assistant",
      content: "Creating your image\u2026",
      timestamp: Date.now(),
      model: "gpt-image-1-mini",
      status: "streaming",
      attachments: []
    };
    chat.messages.push(imageIndicator);
    renderMessages({ focusMessageId: imageIndicator.id });
    announce("Generating image");

    try {
      const imageResponse = await fetch(CONFIG.IMAGE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: imagePrompt })
      });
      const imageData = await imageResponse.json();
      if (!imageResponse.ok) throw new Error(imageData?.error || "Image generation failed.");

      const image = imageData?.image;
      const url = image?.url || (image?.b64_json ? `data:image/png;base64,${image.b64_json}` : "");
      if (!url) throw new Error("Image generation returned no image.");

      imageIndicator.generatedImage = url;
      imageIndicator.model = imageData?.model || "gpt-image-1-mini";
      imageIndicator.content = `Created from: "${imagePrompt}"`;
      imageIndicator.status = "complete";
      incrementImageDailyCount();
    } catch (error) {
      imageIndicator.status = error.name === "AbortError" ? "stopped" : "error";
      imageIndicator.error = error.message || "Image generation failed.";
      imageIndicator.content = "";
    }

    state.loading = false;
    abortController = null;
    chat.updatedAt = Date.now();
    persist();
    updateStats();
    updateComposerState();
    renderMessages();
    return;
  }

  const assistantMessage = options.targetMessage || {
    id: createId("message"),
    role: "assistant",
    content: "",
    timestamp: Date.now(),
    model: state.model,
    status: "streaming",
    attachments: []
  };

  if (!options.targetMessage) chat.messages.push(assistantMessage);
  else assistantMessage.status = "streaming";

  renderMessages({ focusMessageId: assistantMessage.id });
  announce(`Generating with ${MODEL_NAMES[state.model] || state.model}`);

  try {
    const history = createHistory(chat, assistantMessage.id, Boolean(options.targetMessage));
    const response = await fetch(CONFIG.CHAT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abortController.signal,
      body: JSON.stringify({
        message: text,
        model: state.model,
        mode: state.mode,
        plan: getUserTier(),
        timeZone: getClientTimeZone(),
        history,
        memory: state.settings.memory ? state.memory.slice(-8) : [],
        attachments: attachments.map(attachment => ({
          name: attachment.name,
          type: attachment.type,
          kind: attachment.kind,
          dataUrl: attachment.dataUrl,
          extractedText: attachment.extractedText
        }))
      })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || `Chat failed (${response.status}).`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/event-stream") || !response.body) {
      const data = await response.json().catch(() => ({}));
      assistantMessage.content += data.reply || "";
    } else {
      await consumeEventStream(response.body, assistantMessage);
    }

    assistantMessage.status = assistantMessage.content ? "complete" : "error";
    if (!assistantMessage.content) assistantMessage.error = "The model returned an empty response.";

    if (!options.hiddenUser) {
      rememberExchange(text, assistantMessage.content);
      incrementDailyCount();
    }
    announce("Response complete");
  } catch (error) {
    if (error.name === "AbortError") {
      assistantMessage.status = "stopped";
      announce("Generation stopped");
    } else {
      assistantMessage.status = "error";
      assistantMessage.error = error.message || "The response failed.";
      toast(assistantMessage.error, "error");
      announce("The response failed");
    }
  } finally {
    cancelStreamingRender();
    state.loading = false;
    abortController = null;
    chat.updatedAt = Date.now();
    persist();
    updateStats();
    updateComposerState();
    renderMessages({ focusMessageId: assistantMessage.id, preserveScroll: userPausedScroll });
  }
}

async function consumeEventStream(body, assistantMessage) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";

    for (const event of events) {
      const dataLines = event.split("\n")
        .filter(line => line.startsWith("data:"))
        .map(line => line.slice(5).trim());

      for (const dataLine of dataLines) {
        if (!dataLine || dataLine === "[DONE]") continue;
        let payload;
        try {
          payload = JSON.parse(dataLine);
        } catch {
          continue;
        }

        if (payload.error) throw new Error(payload.error.message || "The model stream failed.");
        const token = payload.choices?.[0]?.delta?.content;
        if (typeof token === "string" && token) {
          assistantMessage.content += token;
          assistantMessage.model = payload.model || assistantMessage.model;
          scheduleStreamingRender(assistantMessage);
        }
      }
    }
  }

  if (buffer.trim().startsWith("data:")) {
    const line = buffer.trim().slice(5).trim();
    if (line !== "[DONE]") {
      try {
        const payload = JSON.parse(line);
        const token = payload.choices?.[0]?.delta?.content;
        if (typeof token === "string") assistantMessage.content += token;
      } catch {}
    }
  }
}

function stopGeneration() {
  abortController?.abort();
}

function scheduleStreamingRender(message) {
  if (renderFrame || renderTimer) return;
  const elapsed = performance.now() - lastStreamingPaint;
  const interval = message.content.length > 12_000
    ? 220
    : message.content.length > 4_000
      ? 140
      : STREAM_PAINT_INTERVAL;
  const delay = Math.max(0, interval - elapsed);

  renderTimer = setTimeout(() => {
    renderTimer = null;
    renderFrame = requestAnimationFrame(async () => {
      renderFrame = null;
      lastStreamingPaint = performance.now();
      const article = DOM.chatArea.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`);
      const body = article?.querySelector(".messageContent");
      if (!body) return;
      await renderMessageBody(body, message.content, true);
      if (state.settings.autoScroll && !userPausedScroll) scrollBottom({ force: false });
    });
  }, delay);
}

function cancelStreamingRender() {
  if (renderTimer) clearTimeout(renderTimer);
  if (renderFrame) cancelAnimationFrame(renderFrame);
  renderTimer = null;
  renderFrame = null;
}

function createHistory(chat, assistantMessageId, includeTargetAssistant = false) {
  const endIndex = chat.messages.findIndex(message => message.id === assistantMessageId);
  const messages = endIndex >= 0
    ? chat.messages.slice(0, endIndex + (includeTargetAssistant ? 1 : 0))
    : chat.messages;
  const history = includeTargetAssistant ? messages : messages.slice(0, -1);
  return history
    .filter(message => ["user", "assistant"].includes(message.role) && message.content)
    .slice(-18)
    .map(({ role, content }) => ({ role, content }));
}

async function sendSearchMessage(text) {
  const chat = getChat();
  if (!chat) return;

  if (!canSendMessage()) {
    toast("You've reached your daily message limit. Upgrade or come back tomorrow.", "error");
    return;
  }

  if (!canSearch()) {
    toast("You've reached your daily web search limit. Upgrade or come back tomorrow.", "error");
    return;
  }

  const userMessage = {
    id: createId("message"),
    role: "user",
    content: text,
    timestamp: Date.now(),
    status: "complete",
    attachments: []
  };
  const assistantMessage = {
    id: createId("message"),
    role: "assistant",
    content: "",
    timestamp: Date.now(),
    model: "Web search",
    status: "streaming",
    attachments: []
  };
  chat.messages.push(userMessage, assistantMessage);
  if (chat.title === "New chat") chat.title = createChatTitle(text);
  DOM.input.value = "";
  searchMode = false;
  state.loading = true;
  updateSearchMode();
  updateComposerState();
  renderChats();
  renderMessages();

  try {
    const response = await fetch(CONFIG.SEARCH_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: text })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Search failed.");
    assistantMessage.content = data.answer || "No results found.";
    assistantMessage.searchResults = data.results || [];
    assistantMessage.status = "complete";
    incrementDailyCount();
    incrementSearchDailyCount();
  } catch (error) {
    assistantMessage.status = "error";
    assistantMessage.error = error.message || "Search failed.";
  } finally {
    state.loading = false;
    chat.updatedAt = Date.now();
    persist();
    updateStats();
    updateComposerState();
    renderMessages();
  }
}

async function generateImage() {
  if (state.loading) return;

  if (!canGenerateImage()) {
    toast("You've reached your daily image limit. Upgrade or come back tomorrow.", "error");
    return;
  }

  const prompt = await askForText({
    eyebrow: "Image studio",
    title: "Create an image",
    label: "Show the prompt you want",
    submitLabel: "Generate",
    placeholder: "A cinematic robot exploring a quiet library..."
  });

  if (!prompt) return;

  const chat = getChat();
  if (!chat) return;

  chat.messages.push({
    id: createId("message"),
    role: "user",
    content: `Create an image: ${prompt}`,
    timestamp: Date.now(),
    status: "complete",
    attachments: []
  });

  const assistant = {
    id: createId("message"),
    role: "assistant",
    content: "Creating your image…",
    timestamp: Date.now(),
    model: "gpt-image-1-mini",
    status: "streaming",
    attachments: []
  };

  chat.messages.push(assistant);
  state.loading = true;
  abortController = new AbortController();
  updateComposerState();
  renderMessages({ focusMessageId: assistant.id });

  try {
    const response = await fetch(CONFIG.IMAGE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abortController.signal,
      body: JSON.stringify({ prompt })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Image generation failed.");

    const image = data?.image;
    assistant.generatedImage = image?.url || (image?.b64_json ? `data:image/png;base64,${image.b64_json}` : "");

    if (!assistant.generatedImage) throw new Error("Image generation returned no image.");

    assistant.model = data?.model || "gpt-image-1-mini";
    assistant.content = `Created from: "${prompt}"`;
    assistant.status = "complete";
    incrementImageDailyCount();
  } catch (error) {
    assistant.status = error.name === "AbortError" ? "stopped" : "error";
    assistant.error = error.message || "Image generation failed.";
    assistant.content = "";
  } finally {
    state.loading = false;
    abortController = null;
    chat.updatedAt = Date.now();
    persist();
    updateComposerState();
    renderMessages();
  }
}

function renderMessages(options = {}) {
  const chat = getChat();
  const previousScrollTop = DOM.chatViewport.scrollTop;
  const sameChat = DOM.chatArea.dataset.chatId === chat?.id;
  const isEmpty = !chat?.messages.length;
  DOM.app.classList.toggle("isEmpty", isEmpty);
  document.body.classList.toggle("landingMode", isEmpty);
  DOM.conversationTitle.textContent = chat?.title || "New chat";

  if (isEmpty) {
    if (!sameChat || !DOM.chatArea.querySelector(".emptyState")) {
      DOM.chatArea.replaceChildren(createEmptyState());
    }
    DOM.chatArea.dataset.chatId = chat?.id || "";
    DOM.clearChatBtn.disabled = true;
    return;
  }

  DOM.clearChatBtn.disabled = false;
  DOM.chatArea.querySelector(".emptyState")?.remove();
  if (!sameChat) DOM.chatArea.replaceChildren();
  DOM.chatArea.dataset.chatId = chat.id;

  const existing = new Map(
    [...DOM.chatArea.children]
      .filter(node => node.matches?.("[data-message-id]"))
      .map(node => [node.dataset.messageId, node])
  );
  const activeIds = new Set();
  const renderQueue = [];
  let didChange = !sameChat;

  chat.messages.forEach((message, index) => {
    activeIds.add(message.id);
    let article = existing.get(message.id);

    if (!article || messageElementNeedsUpdate(article, message)) {
      const replacement = createMessageElement(message, index, {
        animate: Boolean(sameChat && !article)
      });
      if (article) article.replaceWith(replacement);
      article = replacement;
      didChange = true;
      renderQueue.push({ article, message });
    }

    const currentAtIndex = DOM.chatArea.children[index];
    if (currentAtIndex !== article) {
      DOM.chatArea.insertBefore(article, currentAtIndex || null);
    }
  });

  existing.forEach((article, id) => {
    if (!activeIds.has(id)) {
      article.remove();
      didChange = true;
    }
  });

  renderQueue.forEach(({ article, message }) => {
    const body = article.querySelector(".messageContent");
    if (body && message.content) {
      renderMessageBody(body, message.content, message.status === "streaming");
    }
  });

  if (options.preserveScroll) {
    requestAnimationFrame(() => DOM.chatViewport.scrollTo({ top: previousScrollTop, behavior: "instant" }));
  } else if (options.focusMessageId) {
    requestAnimationFrame(() => scrollBottom({ force: true, behavior: "instant" }));
  } else if (!sameChat) {
    requestAnimationFrame(() => scrollBottom({ force: true, behavior: "instant" }));
  } else if (didChange && state.settings.autoScroll && !userPausedScroll) {
    requestAnimationFrame(() => scrollBottom({ force: false, behavior: "instant" }));
  }
}

function messageElementNeedsUpdate(article, message) {
  const previous = article._talkatonRenderState;
  if (!previous) return true;
  return previous.content !== message.content
    || previous.status !== message.status
    || previous.timestamp !== message.timestamp
    || previous.model !== message.model
    || previous.error !== message.error
    || previous.generatedImage !== message.generatedImage
    || previous.searchResults !== message.searchResults
    || previous.attachments !== message.attachments
    || previous.timestampsEnabled !== state.settings.timestamps
    || previous.markdownEnabled !== state.settings.markdown;
}

function captureMessageRenderState(message) {
  return {
    content: message.content,
    status: message.status,
    timestamp: message.timestamp,
    model: message.model,
    error: message.error,
    generatedImage: message.generatedImage,
    searchResults: message.searchResults,
    attachments: message.attachments,
    timestampsEnabled: state.settings.timestamps,
    markdownEnabled: state.settings.markdown
  };
}

function createEmptyState() {
  const wrapper = element("div", "emptyState");
  wrapper.setAttribute("aria-labelledby", "landingTitle");
  wrapper.innerHTML = `
    <div class="emptyBrand" aria-hidden="true">T</div>
    <h1 id="landingTitle">Talkaton</h1>
    <p class="heroTagline">Smart. Funny. <span>Slightly unhinged.</span></p>
    <p class="heroQuestion">What are we building today?</p>
    <div class="suggestionGrid">
      <button type="button" data-suggestion="Help me plan a focused week with realistic priorities" aria-label="Start with: Plan my week"><strong>Plan my week</strong><span>Turn a messy list into a clear plan</span></button>
      <button type="button" data-suggestion="Explain a difficult concept to me using a simple analogy" aria-label="Start with: Make it click"><strong>Make it click</strong><span>Explain something without the jargon</span></button>
      <button type="button" data-suggestion="Review this idea and challenge my assumptions" aria-label="Start with: Pressure-test an idea"><strong>Pressure-test an idea</strong><span>Find the gaps before they find you</span></button>
      <button type="button" data-suggestion="Help me write something concise, clear, and human" aria-label="Start with: Write with me"><strong>Write with me</strong><span>Polish a draft or start from scratch</span></button>
    </div>`;
  return wrapper;
}

function createMessageElement(message, index, { animate = true } = {}) {
  const isUser = message.role === "user";
  const article = element("article", `message ${isUser ? "userMessage" : "assistantMessage"}${animate ? " messageEnter" : ""}`);
  article.dataset.messageId = message.id;
  article.dataset.status = message.status || "complete";
  article._talkatonRenderState = captureMessageRenderState(message);

  const inner = element("div", "messageInner");
  const header = element("header", "messageHeader");
  const identity = element("div", "messageIdentity");
  identity.innerHTML = isUser
    ? `<span class="messageAvatar userAvatar" aria-hidden="true">Y</span><strong>You</strong>`
    : `<span class="messageAvatar assistantAvatar" aria-hidden="true">T</span><strong>Talkaton</strong>`;
  header.append(identity);

  if (state.settings.timestamps) {
    const time = element("time", "messageTime");
    time.dateTime = new Date(message.timestamp).toISOString();
    time.textContent = formatTime(message.timestamp);
    header.append(time);
  }

  const body = element("div", "messageContent");

  if (message.status === "streaming" && !message.content) {
    body.append(createTypingIndicator());
  } else if (message.content) {
    body.textContent = message.content;
  }

  if (message.attachments?.length) {
    inner.append(header, createMessageAttachments(message.attachments), body);
  } else {
    inner.append(header, body);
  }

  if (message.generatedImage) {
    const figure = element("figure", "generatedImage");
    const image = new Image();
    image.src = message.generatedImage;
    image.alt = message.content || "AI-generated image";
    image.loading = "lazy";
    image.decoding = "async";
    figure.append(image);
    inner.append(figure);
  }

  if (message.searchResults?.length) {
    const list = element("div", "searchResults");
    message.searchResults.forEach(r => {
      const card = element("a", "searchResultCard");
      card.href = r.url;
      card.target = "_blank";
      card.rel = "noopener noreferrer";
      let domain = "";
      try { domain = new URL(r.url).hostname; } catch {}
      card.innerHTML = `<span class="searchResultUrl">${escapeHtml(domain)}</span><strong class="searchResultTitle">${escapeHtml(r.title)}</strong><span class="searchResultSnippet">${escapeHtml(r.content)}</span>`;
      list.append(card);
    });
    inner.append(list);
  }

  if (message.status === "error") inner.append(createErrorState(message));
  if (message.status === "stopped") {
    const stopped = element("p", "stoppedNote");
    stopped.textContent = "Generation stopped";
    inner.append(stopped);
  }

  inner.append(createMessageFooter(message, index));
  article.append(inner);
  return article;
}

function createMessageFooter(message, index) {
  const footer = element("footer", "messageFooter");
  const metrics = element("span", "messageMetrics");
  if (message.role === "assistant" && message.content) metrics.textContent = getReadingMetrics(message.content);
  footer.append(metrics);

  const actions = element("div", "messageActions");
  if (message.role === "assistant") {
    actions.append(
      actionButton("Copy", "copy"),
      actionButton("Read", "speak"),
      actionButton("Download", "download")
    );
    if (message.status === "complete") {
      actions.append(actionButton("Regenerate", "regenerate"), actionButton("Continue", "continue"));
    }
    if (message.status === "stopped") actions.append(actionButton("Continue", "continue"));
    const model = element("span", "modelName");
    model.textContent = MODEL_NAMES[message.model] || message.model || "Talkaton";
    model.title = "Model used for this response";
    actions.append(model);
  } else {
    actions.append(actionButton("Copy", "copy"), actionButton("Edit", "edit"));
  }
  footer.append(actions);
  return footer;
}

function actionButton(label, action) {
  const button = element("button", "messageAction");
  button.type = "button";
  button.dataset.messageAction = action;
  button.textContent = label;
  return button;
}

function createTypingIndicator() {
  const indicator = element("div", "typingIndicator");
  indicator.setAttribute("role", "status");
  indicator.setAttribute("aria-label", "Talkaton is thinking");
  indicator.innerHTML = "<span></span><span></span><span></span>";
  return indicator;
}

function createErrorState(message) {
  const error = element("div", "messageError");
  error.setAttribute("role", "alert");
  error.innerHTML = `<div><strong>That response hit a snag.</strong><span>${escapeHtml(message.error || "Please try again.")}</span></div><button type="button" data-message-action="retry">Retry</button>`;
  return error;
}

function createMessageAttachments(attachments) {
  const grid = element("div", "messageAttachments");
  attachments.forEach(attachment => {
    if (attachment.kind === "image" && (attachment.previewUrl || attachment.dataUrl)) {
      const image = new Image();
      image.src = attachment.previewUrl || attachment.dataUrl;
      image.alt = attachment.name;
      image.loading = "lazy";
      image.decoding = "async";
      grid.append(image);
    } else {
      const chip = element("div", "messageFile");
      const meta = getAttachmentMeta(attachment);
      chip.innerHTML = `<span>${attachmentGlyph(attachment)}</span><div><strong>${escapeHtml(attachment.name)}</strong><small>${meta}</small></div>`;
      grid.append(chip);
    }
  });
  return grid;
}

async function renderMessageBody(container, content, streaming = false) {
  if (!content) return;
  if (!state.settings.markdown) {
    container.textContent = content;
    return;
  }

  try {
    const markdown = await loadMarkdown();
    markdown.renderRichMarkdown(container, content, { streaming });
  } catch {
    container.textContent = content;
  }
}

function loadMarkdown() {
  if (!markdownModulePromise) markdownModulePromise = import("./modules/markdown.js");
  return markdownModulePromise;
}

async function handleChatAction(event) {
  const suggestion = event.target.closest("[data-suggestion]");
  if (suggestion) {
    DOM.input.value = suggestion.dataset.suggestion;
    resizeTextarea();
    updateComposerState();
    DOM.input.focus();
    return;
  }

  if (event.target.closest(".emptyState") && !event.target.closest("button, a")) {
    DOM.input.focus({ preventScroll: true });
    return;
  }

  const codeButton = event.target.closest("[data-copy-code]");
  if (codeButton) {
    const code = codeButton.closest(".codeBlock")?.querySelector("code")?.textContent || "";
    try {
      await copyText(code);
      codeButton.textContent = "Copied";
      codeButton.dataset.copied = "true";
      announce("Code copied to clipboard");
      setTimeout(() => {
        codeButton.textContent = "Copy";
        delete codeButton.dataset.copied;
      }, 1400);
    } catch {
      toast("Couldn’t copy the code. Please select it manually.", "error");
    }
    return;
  }

  const button = event.target.closest("[data-message-action]");
  if (!button) return;
  const article = button.closest("[data-message-id]");
  const chat = getChat();
  const message = chat?.messages.find(item => item.id === article?.dataset.messageId);
  if (!message) return;

  switch (button.dataset.messageAction) {
    case "copy":
      await copyText(message.content);
      toast("Copied to clipboard");
      break;
    case "download":
      downloadMessage(message);
      break;
    case "speak":
      toggleSpeech(message, button);
      break;
    case "edit":
      editUserMessage(message, article);
      break;
    case "regenerate":
    case "retry":
      regenerateMessage(message);
      break;
    case "continue":
      continueMessage(message);
      break;
  }
}

function regenerateMessage(message) {
  if (state.loading) return;
  const chat = getChat();
  const assistantIndex = chat.messages.findIndex(item => item.id === message.id);
  let userIndex = assistantIndex - 1;
  while (userIndex >= 0 && chat.messages[userIndex].role !== "user") userIndex -= 1;
  if (userIndex < 0) return;
  const userMessage = chat.messages[userIndex];

  if (message.model === "Web search") {
    chat.messages.splice(userIndex);
    searchMode = true;
    return sendSearchMessage(userMessage.content);
  }

  chat.messages.splice(userIndex + 1);
  persist();
  sendMessage({
    text: userMessage.content,
    attachments: userMessage.attachments || [],
    userMessage,
    hiddenUser: true
  });
}

function continueMessage(message) {
  if (state.loading) return;
  const chat = getChat();
  const index = chat.messages.findIndex(item => item.id === message.id);
  if (index < 0) return;
  chat.messages.splice(index + 1);
  sendMessage({
    text: "Continue exactly where the previous response stopped. Do not repeat completed content.",
    hiddenUser: true,
    targetMessage: message
  });
}

function editUserMessage(message, article) {
  if (state.loading || article.querySelector(".messageEditor")) return;
  const body = article.querySelector(".messageContent");
  body.hidden = true;
  const editor = element("form", "messageEditor");
  editor.innerHTML = `<label class="srOnly" for="edit-${message.id}">Edit message</label><textarea id="edit-${message.id}"></textarea><div><button type="button" class="secondaryBtn">Cancel</button><button type="submit" class="primaryBtn">Save & submit</button></div>`;
  const textarea = editor.querySelector("textarea");
  textarea.value = message.content;
  editor.querySelector(".secondaryBtn").addEventListener("click", () => {
    editor.remove();
    body.hidden = false;
  });
  editor.addEventListener("submit", event => {
    event.preventDefault();
    const nextContent = textarea.value.trim();
    if (!nextContent) return;
    message.content = nextContent;
    message.timestamp = Date.now();
    const chat = getChat();
    const index = chat.messages.findIndex(item => item.id === message.id);
    chat.messages.splice(index + 1);
    persist();
    sendMessage({
      text: nextContent,
      attachments: message.attachments || [],
      userMessage: message,
      hiddenUser: true
    });
  });
  body.after(editor);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

function toggleSpeech(message, button) {
  if (!("speechSynthesis" in window) || !state.settings.voice) {
    toast("Voice output is unavailable or disabled.", "error");
    return;
  }
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
    document.querySelectorAll('[data-message-action="speak"]').forEach(item => { item.textContent = "Read"; });
    return;
  }
  const utterance = new SpeechSynthesisUtterance(stripMarkdown(message.content));
  utterance.rate = Number(state.settings.speechRate) || 1;
  utterance.onend = utterance.onerror = () => { button.textContent = "Read"; };
  button.textContent = "Stop";
  speechSynthesis.speak(utterance);
}

function downloadMessage(message) {
  const chat = getChat();
  const blob = new Blob([message.content], { type: "text/markdown;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${slugify(chat?.title || "talkaton-response")}.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function updateMessageMetrics(article, message) {
  const metrics = article?.querySelector(".messageMetrics");
  if (metrics) metrics.textContent = getReadingMetrics(message.content);
}

function renderChats() {
  const query = DOM.chatSearchInput.value.trim().toLowerCase();
  const filtered = state.chats
    .filter(chat => !query || chat.title.toLowerCase().includes(query) || chat.messages.some(message => message.content.toLowerCase().includes(query)))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(b.favorite) - Number(a.favorite) || b.updatedAt - a.updatedAt);
  const visible = filtered.slice(0, visibleChatCount);
  DOM.chatList.replaceChildren();

  if (!visible.length) {
    const empty = element("div", "chatListEmpty");
    empty.textContent = query ? "No chats match your search." : "Your chats will appear here.";
    DOM.chatList.append(empty);
    DOM.chatListSentinel.hidden = true;
    DOM.chatList.append(DOM.chatListSentinel);
    return;
  }

  const pinned = visible.filter(chat => chat.pinned);
  const recent = visible.filter(chat => !chat.pinned);
  if (pinned.length) DOM.chatList.append(createChatGroup("Pinned", pinned));
  if (recent.length) DOM.chatList.append(createChatGroup(query ? "Results" : "Recent", recent));
  DOM.chatListSentinel.hidden = visible.length >= filtered.length;
  DOM.chatList.append(DOM.chatListSentinel);
}

function scheduleChatSearchRender() {
  if (chatSearchTimer) clearTimeout(chatSearchTimer);
  chatSearchTimer = setTimeout(() => {
    chatSearchTimer = null;
    visibleChatCount = CONFIG.INITIAL_CHAT_BATCH;
    renderChats();
  }, 100);
}

function createChatGroup(label, chats) {
  const group = element("section", "chatGroup");
  const heading = element("h2", "chatGroupTitle");
  heading.textContent = label;
  group.append(heading);
  chats.forEach(chat => group.append(createChatItem(chat)));
  return group;
}

function createChatItem(chat) {
  const item = element("div", `chatItem${chat.id === state.currentChatId ? " active" : ""}`);
  item.setAttribute("role", "listitem");
  item.dataset.chatId = chat.id;
  const open = element("button", "chatSelectBtn");
  open.type = "button";
  open.dataset.chatAction = "open";
  open.innerHTML = `<span>${escapeHtml(chat.title)}</span><small>${formatRelativeTime(chat.updatedAt)}</small>`;
  open.title = chat.title;

  const favorite = element("button", `chatIconBtn${chat.favorite ? " selected" : ""}`);
  favorite.type = "button";
  favorite.dataset.chatAction = "favorite";
  favorite.setAttribute("aria-label", `${chat.favorite ? "Remove from" : "Add to"} favorites: ${chat.title}`);
  favorite.title = chat.favorite ? "Remove favorite" : "Favorite";
  favorite.textContent = "★";

  const menu = element("button", "chatIconBtn");
  menu.type = "button";
  menu.dataset.chatAction = "menu";
  menu.setAttribute("aria-label", `More options for ${chat.title}`);
  menu.textContent = "•••";

  const actions = element("div", "chatMenu");
  actions.hidden = true;
  actions.innerHTML = `
    <button type="button" data-chat-action="pin">${chat.pinned ? "Unpin" : "Pin"}</button>
    <button type="button" data-chat-action="rename">Rename</button>
    <button type="button" class="dangerAction" data-chat-action="delete">Delete</button>`;

  item.append(open, favorite, menu, actions);
  return item;
}

async function handleChatListAction(event) {
  const button = event.target.closest("[data-chat-action]");
  if (!button) return;
  const item = button.closest("[data-chat-id]");
  const chat = state.chats.find(candidate => candidate.id === item?.dataset.chatId);
  if (!chat) return;
  const action = button.dataset.chatAction;

  if (action !== "menu") closeAllChatMenus(item);

  switch (action) {
    case "open":
      if (state.loading) stopGeneration();
      state.currentChatId = chat.id;
      state.pendingAttachments = [];
      persist();
      renderChats();
      renderMessages();
      renderAttachmentTray();
      closeMobileSidebar();
      break;
    case "menu":
      closeAllChatMenus(item);
      item.querySelector(".chatMenu").hidden = !item.querySelector(".chatMenu").hidden;
      break;
    case "favorite":
      chat.favorite = !chat.favorite;
      chat.updatedAt = Date.now();
      persist();
      renderChats();
      break;
    case "pin":
      chat.pinned = !chat.pinned;
      chat.updatedAt = Date.now();
      persist();
      renderChats();
      toast(chat.pinned ? "Chat pinned" : "Chat unpinned");
      break;
    case "rename": {
      const name = await askForText({
        eyebrow: "Conversation",
        title: "Rename chat",
        label: "Chat name",
        value: chat.title,
        submitLabel: "Save"
      });
      if (!name) return;
      chat.title = name.slice(0, 80);
      chat.updatedAt = Date.now();
      persist();
      renderChats();
      if (chat.id === state.currentChatId) DOM.conversationTitle.textContent = chat.title;
      break;
    }
    case "delete": {
      const confirmation = await askForText({
        eyebrow: "Delete chat",
        title: `Delete “${chat.title}”?`,
        label: "Type delete to confirm",
        placeholder: "delete",
        submitLabel: "Delete"
      });
      if (confirmation?.toLowerCase() !== "delete") return;
      deleteChat(chat.id);
      break;
    }
  }
}

function closeAllChatMenus(exceptItem) {
  DOM.chatList.querySelectorAll(".chatMenu").forEach(menu => {
    if (!exceptItem || !exceptItem.contains(menu)) menu.hidden = true;
  });
}

function deleteChat(chatId) {
  state.chats = state.chats.filter(chat => chat.id !== chatId);
  if (!state.chats.length) state.chats = [makeChat()];
  if (!state.chats.some(chat => chat.id === state.currentChatId)) state.currentChatId = state.chats[0].id;
  persist();
  renderChats();
  renderMessages();
  toast("Chat deleted");
}

async function clearConversation() {
  const chat = getChat();
  if (!chat?.messages.length || state.loading) return;
  const confirmation = await askForText({
    eyebrow: "Clear conversation",
    title: "Start this chat over?",
    label: "Type clear to confirm",
    placeholder: "clear",
    submitLabel: "Clear"
  });
  if (confirmation?.toLowerCase() !== "clear") return;
  chat.messages = [];
  chat.title = "New chat";
  chat.updatedAt = Date.now();
  persist();
  renderChats();
  renderMessages();
  DOM.input.focus();
  toast("Conversation cleared");
}

async function addFiles(fileList) {
  const files = [...(fileList || [])];
  if (!files.length) return;
  if (state.pendingAttachments.length + files.length > 10) {
    toast("You can attach up to 10 files at once.", "error");
    return;
  }

  const placeholders = files.map(file => ({
    id: createId("upload"),
    name: file.name,
    size: file.size,
    type: file.type,
    kind: file.type.startsWith("image/") ? "image" : "file",
    progress: 3,
    status: "processing"
  }));
  state.pendingAttachments.push(...placeholders);
  renderAttachmentTray();
  updateComposerState();

  let readyCount = 0;
  const failures = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const placeholder = placeholders[index];

    try {
      const [prepared] = await prepareFiles([file], (_activeFile, progress) => {
        placeholder.progress = progress;
        renderAttachmentTray();
      });
      const stateIndex = state.pendingAttachments.findIndex(item => item.id === placeholder.id);
      if (stateIndex >= 0) {
        state.pendingAttachments[stateIndex] = prepared;
        readyCount += 1;
      }
    } catch (error) {
      state.pendingAttachments = state.pendingAttachments.filter(item => item.id !== placeholder.id);
      failures.push(error.message || `${file.name} could not be attached.`);
    }

    renderAttachmentTray();
    updateComposerState();
  }

  DOM.imageInput.value = "";
  DOM.fileInput.value = "";

  if (readyCount) {
    toast(`${readyCount} ${readyCount === 1 ? "file" : "files"} ready`);
    announce(`${readyCount} ${readyCount === 1 ? "file is" : "files are"} ready to send`);
  }
  if (failures.length) {
    const detail = failures.length === 1
      ? failures[0]
      : `${failures.length} files could not be added. Supported: ${ACCEPTED_FILE_LABEL}.`;
    toast(detail, "error");
  }
}

async function addFolder(fileList) {
  const files = [...(fileList || [])];
  if (!files.length) return;
  if (state.pendingAttachments.length >= 10) {
    toast("Remove an attachment before adding a folder.", "error");
    return;
  }

  const firstPath = files[0].webkitRelativePath || files[0].talkatonRelativePath || "";
  const folderName = firstPath.includes("/") ? firstPath.split("/")[0] : "Uploaded folder";
  const placeholder = {
    id: createId("upload"),
    name: `${folderName}/`,
    size: files.reduce((total, file) => total + file.size, 0),
    type: "application/x-directory",
    kind: "folder",
    progress: 3,
    status: "processing"
  };

  state.pendingAttachments.push(placeholder);
  renderAttachmentTray();
  updateComposerState();

  try {
    const prepared = await prepareFolder(files, (_file, progress) => {
      placeholder.progress = progress;
      renderAttachmentTray();
    });
    const stateIndex = state.pendingAttachments.findIndex(item => item.id === placeholder.id);
    if (stateIndex >= 0) {
      state.pendingAttachments[stateIndex] = prepared;
      toast(`${prepared.fileCount} files from ${prepared.name} ready`);
      announce(`${prepared.name} is ready to send`);
    }
  } catch (error) {
    state.pendingAttachments = state.pendingAttachments.filter(item => item.id !== placeholder.id);
    toast(error.message || "That folder could not be attached.", "error");
  } finally {
    DOM.folderInput.value = "";
    renderAttachmentTray();
    updateComposerState();
  }
}

function createAttachmentPrompt(attachments) {
  if (!attachments.length) return "";
  if (attachments.length === 1) {
    const attachment = attachments[0];
    if (attachment.kind === "folder") return "Please analyze the attached folder.";
    return attachment.kind === "image"
      ? "Please analyze the attached image."
      : `Please analyze the attached file: ${attachment.name}.`;
  }
  return "Please analyze the attached files together.";
}

function renderAttachmentTray() {
  DOM.attachmentTray.replaceChildren();
  DOM.attachmentTray.hidden = state.pendingAttachments.length === 0;

  state.pendingAttachments.forEach(attachment => {
    const item = element("div", `attachmentPreview ${attachment.kind === "image" ? "imagePreview" : "filePreview"}`);
    item.dataset.attachmentId = attachment.id;
    if (attachment.kind === "image" && attachment.previewUrl) {
      const image = new Image();
      image.src = attachment.previewUrl;
      image.alt = "";
      item.append(image);
    } else {
      const icon = element("span", "fileIcon");
      icon.textContent = attachmentGlyph(attachment);
      item.append(icon);
    }

    const copy = element("div", "attachmentCopy");
    const readyMeta = getAttachmentMeta(attachment);
    copy.innerHTML = `<strong>${escapeHtml(attachment.name)}</strong><small>${attachment.status === "processing" ? `Preparing ${Math.round(attachment.progress || 0)}%` : readyMeta}</small>`;
    item.append(copy);

    const remove = element("button", "attachmentRemove");
    remove.type = "button";
    remove.dataset.removeAttachment = attachment.id;
    remove.setAttribute("aria-label", `Remove ${attachment.name}`);
    remove.textContent = "×";
    item.append(remove);

    if (attachment.status === "processing") {
      const progress = element("span", "uploadProgress");
      progress.style.setProperty("--progress", `${attachment.progress || 0}%`);
      item.append(progress);
    }
    DOM.attachmentTray.append(item);
  });
}

function handleAttachmentAction(event) {
  const button = event.target.closest("[data-remove-attachment]");
  if (!button) return;
  state.pendingAttachments = state.pendingAttachments.filter(item => item.id !== button.dataset.removeAttachment);
  renderAttachmentTray();
  updateComposerState();
}

function getAttachmentMeta(attachment) {
  if (attachment.kind !== "folder") return formatFileSize(attachment.size);
  const skipped = attachment.skippedCount
    ? ` · ${attachment.skippedCount} skipped`
    : "";
  return `${attachment.fileCount || 0} files${skipped} · ${formatFileSize(attachment.size)}`;
}

function stripAttachmentForMessage(attachment) {
  return {
    id: attachment.id,
    name: attachment.name,
    size: attachment.size,
    type: attachment.type,
    extension: attachment.extension,
    kind: attachment.kind,
    previewUrl: attachment.previewUrl,
    dataUrl: attachment.dataUrl,
    extractedText: attachment.extractedText,
    fileCount: attachment.fileCount,
    skippedCount: attachment.skippedCount
  };
}

function handleDragEnter(event) {
  event.preventDefault();
  if (!event.dataTransfer?.types?.includes("Files")) return;
  dragDepth += 1;
  DOM.composer.classList.add("isDragging");
}

function handleDragOver(event) {
  event.preventDefault();
  if (!event.dataTransfer?.types?.includes("Files")) return;
  event.dataTransfer.dropEffect = "copy";
  DOM.composer.classList.add("isDragging");
}

function handleDragLeave(event) {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) DOM.composer.classList.remove("isDragging");
}

async function handleDrop(event) {
  event.preventDefault();
  dragDepth = 0;
  DOM.composer.classList.remove("isDragging");
  const folderFiles = await collectDroppedFolderFiles(event.dataTransfer);
  if (folderFiles.length) {
    await addFolder(folderFiles);
  } else {
    addFiles(event.dataTransfer?.files);
  }
}

async function collectDroppedFolderFiles(dataTransfer) {
  const entries = [...(dataTransfer?.items || [])]
    .map(item => item.webkitGetAsEntry?.())
    .filter(entry => entry?.isDirectory);
  if (!entries.length) return [];

  const files = [];
  for (const entry of entries) {
    await readDroppedEntry(entry, "", files);
  }
  return files;
}

async function readDroppedEntry(entry, parentPath, files) {
  if (files.length >= 500) return;
  const path = `${parentPath}${entry.name}`;

  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
    file.talkatonRelativePath = path;
    files.push(file);
    return;
  }

  if (!entry.isDirectory) return;
  const directoryName = entry.name.toLowerCase();
  if ([".git", ".next", ".nuxt", ".svelte-kit", "build", "coverage", "dist", "node_modules", "target", "vendor"].includes(directoryName)) {
    return;
  }

  const reader = entry.createReader();
  while (files.length < 500) {
    const children = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!children.length) break;
    for (const child of children) {
      await readDroppedEntry(child, `${path}/`, files);
      if (files.length >= 500) break;
    }
  }
}

function handlePaste(event) {
  const imageFiles = [...(event.clipboardData?.files || [])].filter(file => file.type.startsWith("image/"));
  if (imageFiles.length) {
    event.preventDefault();
    addFiles(imageFiles);
  }
}

function toggleSearchMode() {
  searchMode = !searchMode;
  updateSearchMode();
  DOM.input.focus();
}

function updateSearchMode() {
  DOM.searchBtn.setAttribute("aria-pressed", String(searchMode));
  DOM.searchBtn.classList.toggle("active", searchMode);
  DOM.composer.classList.toggle("searchMode", searchMode);
  DOM.input.placeholder = searchMode ? "Search the web with Talkaton" : "Message Talkaton";
  toast(searchMode ? "Web search on" : "Web search off");
}

function toggleVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    toast("Voice input isn’t supported in this browser.", "error");
    return;
  }

  if (recognition) {
    recognition.stop();
    recognition = null;
    DOM.voiceBtn.classList.remove("recording");
    DOM.voiceBtn.setAttribute("aria-pressed", "false");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = document.documentElement.lang || "en-US";
  let finalTranscript = DOM.input.value;

  recognition.onstart = () => {
    DOM.voiceBtn.classList.add("recording");
    DOM.voiceBtn.setAttribute("aria-pressed", "true");
    announce("Voice input started");
  };
  recognition.onresult = event => {
    let interim = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      if (event.results[index].isFinal) finalTranscript += `${finalTranscript ? " " : ""}${event.results[index][0].transcript}`;
      else interim += event.results[index][0].transcript;
    }
    DOM.input.value = `${finalTranscript}${interim ? ` ${interim}` : ""}`;
    resizeTextarea();
    updateComposerState();
  };
  recognition.onend = () => {
    recognition = null;
    DOM.voiceBtn.classList.remove("recording");
    DOM.voiceBtn.setAttribute("aria-pressed", "false");
    announce("Voice input stopped");
  };
  recognition.onerror = event => {
    if (event.error !== "aborted") toast(`Voice input: ${event.error}`, "error");
  };
  recognition.start();
}

function openSettings() {
  byId("themeSelect").value = state.settings.theme;
  byId("timestampsToggle").checked = state.settings.timestamps;
  byId("autoScrollToggle").checked = state.settings.autoScroll;
  byId("memoryToggle").checked = state.settings.memory;
  byId("markdownToggle").checked = state.settings.markdown;
  byId("voiceOutputToggle").checked = state.settings.voice;
  byId("speechRateInput").value = state.settings.speechRate;
  byId("speechRateValue").textContent = `${state.settings.speechRate}×`;
  DOM.settingsDialog.showModal();
}

function saveSettingsFromDialog() {
  state.settings.theme = byId("themeSelect").value;
  state.settings.timestamps = byId("timestampsToggle").checked;
  state.settings.autoScroll = byId("autoScrollToggle").checked;
  state.settings.memory = byId("memoryToggle").checked;
  state.settings.markdown = byId("markdownToggle").checked;
  state.settings.voice = byId("voiceOutputToggle").checked;
  state.settings.speechRate = Number(byId("speechRateInput").value);
  byId("speechRateValue").textContent = `${state.settings.speechRate}×`;
  applyPreferences();
  persist();
  renderMessages();
}

function applyPreferences() {
  DOM.modeSelect.value = state.mode;
  DOM.modelSelect.value = state.model;
  DOM.app.classList.toggle("sidebarCollapsed", Boolean(state.sidebarCollapsed));
  applyTheme();
}

function applyTheme() {
  const theme = state.settings.theme === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : state.settings.theme;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#0b0b0c" : "#f7f7f8";
}

function cycleTheme() {
  const order = ["system", "dark", "light"];
  state.settings.theme = order[(order.indexOf(state.settings.theme) + 1) % order.length];
  applyTheme();
  persist();
  toast(`Theme: ${state.settings.theme}`);
}

function openMemory() {
  DOM.memoryContent.replaceChildren();
  if (!state.memory.length) {
    DOM.memoryContent.innerHTML = `<div class="dialogEmpty"><strong>No saved memory yet</strong><span>Useful context from your chats will appear here.</span></div>`;
  } else {
    const list = element("div", "memoryList");
    [...state.memory].reverse().slice(0, 40).forEach(item => {
      const card = element("article", "memoryCard");
      card.innerHTML = `<strong>${escapeHtml(item.user || "Conversation")}</strong><p>${escapeHtml(item.ai || "")}</p><time>${formatRelativeTime(item.time)}</time>`;
      list.append(card);
    });
    DOM.memoryContent.append(list);
  }
  DOM.memoryDialog.showModal();
}

async function restoreSession() {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    state.user = data?.session?.user || null;
    state.loggedIn = Boolean(state.user);
    if (data?.session?.user) {
      const authParams = new URLSearchParams(window.location.search);
      if (authParams.get("recovery") === "1") {
        passwordRecoveryPending = true;
        openPasswordRecoveryDialog();
      } else if (authParams.get("signup-confirmed") === "1") {
        completeEmailSignupConfirmation();
      } else if (authParams.get("login-confirmed") === "1") {
        completeEmailLoginConfirmation();
      }
    }
  } catch (error) {
    console.warn("Session restore unavailable:", error);
  }
}

async function handleAuth() {
  if (passwordRecoveryPending) {
    openPasswordRecoveryDialog();
    return;
  }

  if (state.loggedIn) {
    openProfile();
    return;
  }
  setAuthMode("signIn", { focus: false });
  setAuthMessage("");
  DOM.authDialog.showModal();
  requestAnimationFrame(() => DOM.authEmail.focus());
}

async function submitAuth(event) {
  event.preventDefault();
  setAuthMessage("");
  const modeAtSubmit = authMode;
  const isSignUp = modeAtSubmit === "signUp";
  const email = DOM.authEmail.value.trim();
  const password = DOM.authPassword.value;

  if (isSignUp) {
    if (password.length < 8) {
      setAuthMessage("Use at least 8 characters for your password.");
      DOM.authPassword.focus();
      return;
    }
    if (password !== DOM.authConfirmPassword.value) {
      setAuthMessage("Those passwords don’t match.");
      DOM.authConfirmPassword.focus();
      return;
    }
  }

  const submit = DOM.authSubmitBtn;
  submit.disabled = true;
  DOM.signInTab.disabled = true;
  DOM.signUpTab.disabled = true;
  DOM.forgotPasswordBtn.disabled = true;
  submit.textContent = isSignUp ? "Creating account…" : "Logging in…";

  try {
    const supabase = await getSupabase();

    if (isSignUp) {
      const redirectUrl = new URL(window.location.href);
      redirectUrl.search = "?signup-confirmed=1";
      redirectUrl.hash = "";
      signupConfirmationPending = true;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl.toString()
        }
      });
      if (error) throw error;

      // Supabase sends the confirmation from signUp when email confirmation is
      // enabled. If it is disabled, require an emailed OTP before keeping a
      // local session so signup still follows the same confirmation flow.
      if (data.session?.user) {
        const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
        if (signOutError) throw signOutError;
        const { error: confirmationError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: redirectUrl.toString()
          }
        });
        if (confirmationError) throw confirmationError;
      }

      state.user = null;
      state.loggedIn = false;
      DOM.authPassword.value = "";
      DOM.authConfirmPassword.value = "";
      updateAccount();
      setAuthMessage(
        "Account created. We sent you a confirmation email—click the link to finish signing up.",
        "success"
      );
      announce("Account created. Confirmation email sent");
      return;
    }

    loginConfirmationPending = true;
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;

    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError) throw signOutError;

    const redirectUrl = new URL(window.location.href);
    redirectUrl.search = "?login-confirmed=1";
    redirectUrl.hash = "";
    const { error: confirmationError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: redirectUrl.toString()
      }
    });
    if (confirmationError) throw confirmationError;

    state.user = null;
    state.loggedIn = false;
    DOM.authPassword.value = "";
    updateAccount();
    setAuthMessage(
      "Password accepted. Check your email and click the confirmation link to finish signing in.",
      "success"
    );
    announce("Sign-in confirmation email sent");
  } catch (error) {
    setAuthMessage(error.message || (isSignUp ? "Sign up failed." : "Log in failed."));
  } finally {
    loginConfirmationPending = false;
    signupConfirmationPending = false;
    submit.disabled = false;
    DOM.signInTab.disabled = false;
    DOM.signUpTab.disabled = false;
    DOM.forgotPasswordBtn.disabled = false;
    submit.textContent = authMode === "signUp" ? "Sign up" : "Log in";
  }
}

function openProfile() {
  if (!state.loggedIn || !state.user) return;
  const username = getProfileName(state.user);
  pendingProfileAvatar = getProfileAvatar(state.user);
  DOM.profileUsername.value = username;
  DOM.profileEmail.value = state.user.email || "";
  DOM.profileError.textContent = "";
  renderProfileAvatar(username);

  const messageCount = state.chats.reduce((total, chat) => total + chat.messages.length, 0);
  const remaining = getRemainingMessages();
  const limit = getDailyLimit();
  const limitText = remaining === "∞" ? "∞" : `${remaining} / ${limit}`;
  const tier = getUserTier();
  const tierLabel = tier === "dev" ? "Dev plan" : tier === "free" ? "Free plan" : "Guest plan";
  DOM.profileDashboard.innerHTML = `
    <article><span>Your plan</span><strong>${tierLabel}</strong><small>${tier === "dev" ? "All features unlimited" : tier === "free" ? "Standard access" : "Limited access"}</small></article>
    <article><span>Messages left today</span><strong>${limitText}</strong><small>${tierLabel}</small></article>
    <article><span>Conversations</span><strong>${state.chats.length}</strong><small>${messageCount} messages in total</small></article>
    <article><span>Saved memories</span><strong>${state.memory.length}</strong><small>${state.settings.memory ? "Memory is on" : "Memory is paused"}</small></article>`;

  if (!DOM.profileDialog.open) DOM.profileDialog.showModal();
  requestAnimationFrame(() => DOM.profileUsername.focus());
}

async function saveProfile(event) {
  event.preventDefault();
  const username = DOM.profileUsername.value.trim();
  DOM.profileError.textContent = "";

  if (username.length < 2) {
    DOM.profileError.textContent = "Use at least 2 characters for your username.";
    DOM.profileUsername.focus();
    return;
  }

  setProfileBusy(true);
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.updateUser({
      data: {
        username,
        name: username,
        avatar_url: pendingProfileAvatar || null
      }
    });
    if (error) throw error;
    state.user = data.user || state.user;
    state.loggedIn = Boolean(state.user);
    updateAccount();
    DOM.profileDialog.close();
    toast("Profile updated");
    announce("Profile updated successfully");
  } catch (error) {
    DOM.profileError.textContent = error.message || "Couldn’t update your profile.";
  } finally {
    setProfileBusy(false);
  }
}

async function handleProfileImageSelection(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  DOM.profileError.textContent = "";
  DOM.profileUploadBtn.disabled = true;
  DOM.profileUploadBtn.textContent = "Preparing…";

  try {
    pendingProfileAvatar = await createProfileAvatar(file);
    renderProfileAvatar(DOM.profileUsername.value.trim() || getProfileName(state.user));
    announce("Profile picture ready to save");
  } catch (error) {
    DOM.profileError.textContent = error.message || "Couldn’t prepare that profile picture.";
  } finally {
    DOM.profileUploadBtn.disabled = false;
    DOM.profileUploadBtn.textContent = "Choose photo";
  }
}

function removeProfileImage() {
  pendingProfileAvatar = "";
  renderProfileAvatar(DOM.profileUsername.value.trim() || getProfileName(state.user));
  announce("Profile picture removed. Save your profile to apply the change.");
}

async function logoutFromProfile() {
  setProfileBusy(true, "logout");
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
    state.user = null;
    state.loggedIn = false;
    pendingProfileAvatar = "";
    if (DOM.profileDialog.open) DOM.profileDialog.close();
    updateAccount();
    toast("Logged out");
    announce("Logged out successfully");
  } catch (error) {
    DOM.profileError.textContent = error.message || "Couldn’t log out. Check your connection.";
  } finally {
    setProfileBusy(false);
  }
}

function setProfileBusy(busy, action = "save") {
  DOM.profileSaveBtn.disabled = busy;
  DOM.profileLogoutBtn.disabled = busy;
  DOM.profileUploadBtn.disabled = busy;
  DOM.profileRemoveBtn.disabled = busy || !pendingProfileAvatar;
  DOM.profileUsername.disabled = busy;
  DOM.profileSaveBtn.textContent = busy && action === "save" ? "Saving…" : "Save profile";
  DOM.profileLogoutBtn.textContent = busy && action === "logout" ? "Logging out…" : "Log out";
}

function renderProfileAvatar(username) {
  const initial = String(username || "Account").charAt(0).toUpperCase();
  DOM.profileAvatarInitial.textContent = initial;
  DOM.profileAvatarImage.hidden = !pendingProfileAvatar;
  DOM.profileAvatarImage.src = pendingProfileAvatar || "";
  DOM.profileRemoveBtn.disabled = !pendingProfileAvatar;
}

function getProfileName(user) {
  return String(
    user?.user_metadata?.username
    || user?.user_metadata?.name
    || user?.email?.split("@")[0]
    || "Account"
  ).slice(0, 30);
}

function getProfileAvatar(user) {
  const avatar = user?.user_metadata?.avatar_url;
  if (typeof avatar !== "string") return "";
  if (avatar.startsWith("data:image/") || avatar.startsWith("https://")) return avatar;
  return "";
}

async function createProfileAvatar(file) {
  const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!acceptedTypes.has(file.type)) throw new Error("Choose a JPG, PNG, or WebP image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Profile pictures must be 5 MB or smaller.");

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const preview = new Image();
      preview.onload = () => resolve(preview);
      preview.onerror = () => reject(new Error("That image could not be opened."));
      preview.src = sourceUrl;
    });
    const size = 96;
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
    const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.76);
    if (dataUrl.length > 24_000) throw new Error("That image is still too large after compression.");
    return dataUrl;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function setAuthMode(mode, { focus = true } = {}) {
  authMode = mode === "signUp" ? "signUp" : "signIn";
  const isSignUp = authMode === "signUp";

  DOM.signInTab.setAttribute("aria-pressed", String(!isSignUp));
  DOM.signUpTab.setAttribute("aria-pressed", String(isSignUp));
  DOM.authEyebrow.textContent = isSignUp ? "Join Talkaton" : "Welcome back";
  DOM.authTitle.textContent = isSignUp ? "Create your account" : "Log in to Talkaton";
  DOM.authIntro.textContent = isSignUp
    ? "Enter your email and create a password. We’ll email you a confirmation link."
    : "Welcome back. Enter your account details to continue.";
  DOM.authConfirmPasswordField.hidden = !isSignUp;
  DOM.authConfirmPassword.disabled = !isSignUp;
  DOM.authConfirmPassword.required = isSignUp;
  DOM.authPassword.autocomplete = isSignUp ? "new-password" : "current-password";
  DOM.authPassword.minLength = isSignUp ? 8 : 0;
  DOM.forgotPasswordBtn.closest(".authHelpRow").hidden = isSignUp;
  DOM.authSubmitBtn.textContent = isSignUp ? "Sign up" : "Log in";
  setAuthMessage("");

  if (focus) {
    requestAnimationFrame(() => DOM.authEmail.focus());
  }
}

async function requestPasswordReset() {
  const email = DOM.authEmail.value.trim();
  setAuthMessage("");

  if (!email || !DOM.authEmail.checkValidity()) {
    setAuthMessage("Enter the email address for your Talkaton account.");
    DOM.authEmail.focus();
    DOM.authEmail.reportValidity();
    return;
  }

  const button = DOM.forgotPasswordBtn;
  button.disabled = true;
  button.textContent = "Sending reset email…";

  try {
    const supabase = await getSupabase();
    const redirectUrl = new URL(window.location.href);
    redirectUrl.search = "?recovery=1";
    redirectUrl.hash = "";
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl.toString()
    });
    if (error) throw error;
    setAuthMessage(
      "If an account exists for that email, a password reset link is on its way.",
      "success"
    );
    announce("Password reset email sent");
  } catch (error) {
    setAuthMessage(error.message || "Couldn’t send the reset email. Please try again.");
  } finally {
    button.disabled = false;
    button.textContent = "Forgot password?";
  }
}

function openPasswordRecoveryDialog() {
  if (DOM.authDialog.open) DOM.authDialog.close();
  DOM.passwordResetError.textContent = "";
  if (!DOM.passwordResetDialog.open) DOM.passwordResetDialog.showModal();
  requestAnimationFrame(() => DOM.newPassword.focus());
}

async function submitPasswordReset(event) {
  event.preventDefault();
  DOM.passwordResetError.textContent = "";
  const password = DOM.newPassword.value;
  const confirmation = DOM.confirmPassword.value;

  if (password.length < 8) {
    DOM.passwordResetError.textContent = "Use at least 8 characters.";
    DOM.newPassword.focus();
    return;
  }

  if (password !== confirmation) {
    DOM.passwordResetError.textContent = "Those passwords don’t match.";
    DOM.confirmPassword.focus();
    return;
  }

  const submit = DOM.passwordResetForm.querySelector('[type="submit"]');
  submit.disabled = true;
  submit.textContent = "Updating password…";

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    state.user = data.user || state.user;
    state.loggedIn = true;
    passwordRecoveryPending = false;
    DOM.passwordResetForm.reset();
    DOM.passwordResetDialog.close();
    clearPasswordRecoveryUrl();
    updateAccount();
    toast("Password updated. You’re signed in.");
    announce("Password updated successfully");
  } catch (error) {
    DOM.passwordResetError.textContent = error.message || "Couldn’t update your password.";
  } finally {
    submit.disabled = false;
    submit.textContent = "Update password";
  }
}

function setAuthMessage(message, type = "error") {
  DOM.authError.textContent = message;
  DOM.authError.classList.toggle("success", type === "success");
}

function clearPasswordRecoveryUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("recovery");
  url.hash = "";
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
}

function completeEmailLoginConfirmation() {
  const url = new URL(window.location.href);
  url.searchParams.delete("login-confirmed");
  url.hash = "";
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
  if (DOM.authDialog.open) DOM.authDialog.close();
  updateAccount();
  toast("Email confirmed. Welcome back.");
  announce("Email confirmed. You are signed in.");
}

function completeEmailSignupConfirmation() {
  const url = new URL(window.location.href);
  url.searchParams.delete("signup-confirmed");
  url.hash = "";
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
  if (DOM.authDialog.open) DOM.authDialog.close();
  updateAccount();
  toast("Email confirmed. Your Talkaton account is ready.");
  announce("Email confirmed. Your account is ready.");
}

function updateAccount() {
  const strong = DOM.loginBtn.querySelector("strong");
  const small = DOM.loginBtn.querySelector("small");
  const avatar = DOM.loginBtn.querySelector(".avatar");
  avatar.replaceChildren();
  if (state.loggedIn && state.user) {
    const name = getProfileName(state.user);
    const avatarUrl = getProfileAvatar(state.user);
    strong.textContent = name;
    small.textContent = passwordRecoveryPending ? "Set a new password" : "View profile";
    DOM.loginBtn.setAttribute("aria-label", `Open profile for ${name}`);
    if (avatarUrl) {
      const image = new Image();
      image.src = avatarUrl;
      image.alt = "";
      avatar.append(image);
    } else {
      avatar.textContent = name.charAt(0).toUpperCase();
    }
  } else {
    strong.textContent = "Guest";
    small.textContent = "Log in or sign up";
    avatar.textContent = "G";
    DOM.loginBtn.setAttribute("aria-label", "Log in or sign up");
  }
}

async function updateVisitorCounter() {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc("record_unique_visit", { p_visitor_id: getVisitorId() });
    if (error) throw error;
    const count = Number(data);
    if (!Number.isFinite(count)) throw new Error("Invalid visitor count");
    DOM.visitorCount.textContent = count.toLocaleString();
  } catch (error) {
    console.warn("Visitor counter unavailable:", error);
    DOM.visitorCount.textContent = "—";
    DOM.visitorCount.closest(".visitorCounter").title = "Visitor counter is temporarily unavailable";
  }
}

function updateStats() {
  DOM.memoryCount.textContent = state.memory.length;
  updateMessageCounter();
}

function updateMessageCounter() {
  resetDailyIfNewDay();
  const remaining = getRemainingMessages();
  if (remaining === "∞") {
    DOM.messageCounter.textContent = "∞";
    DOM.messageCounter.title = "Unlimited messages";
    DOM.messageCounter.classList.remove("atLimit", "nearLimit");
  } else {
    const limit = getDailyLimit();
    DOM.messageCounter.textContent = `${remaining}/${limit}`;
    DOM.messageCounter.title = `${remaining} messages remaining today`;
    DOM.messageCounter.classList.toggle("atLimit", remaining === 0);
    DOM.messageCounter.classList.toggle("nearLimit", remaining > 0 && remaining <= 5);
  }
}

function rememberExchange(user, assistant) {
  if (!state.settings.memory || !assistant) return;
  state.memory.push({ user, ai: assistant, time: Date.now() });
  if (state.memory.length > CONFIG.MAX_MEMORY) state.memory.shift();
}

function updateComposerState() {
  const hasText = Boolean(DOM.input.value.trim());
  const hasAttachments = state.pendingAttachments.length > 0;
  const uploadsReady = state.pendingAttachments.every(item => item.status === "ready");
  DOM.sendBtn.disabled = state.loading ? false : ((!hasText && !hasAttachments) || !uploadsReady);
  DOM.sendBtn.classList.toggle("isStopping", state.loading);
  DOM.sendBtn.setAttribute("aria-label", state.loading ? "Stop generation" : "Send message");
  DOM.input.disabled = false;
  DOM.modelSelect.disabled = state.loading;
  DOM.modeSelect.disabled = state.loading;
  DOM.charCount.textContent = DOM.input.value.length > 2000 ? DOM.input.value.length.toLocaleString() : "";
}

function handleComposerKeydown(event) {
  if (isMessageSubmitKey(event)) {
    event.preventDefault();
    if (typeof DOM.composer.requestSubmit === "function") {
      DOM.composer.requestSubmit();
    } else {
      state.loading ? stopGeneration() : sendMessage();
    }
  }
  if (event.key === "Escape" && state.loading) stopGeneration();
}

function handleComposerSubmit(event) {
  event.preventDefault();
  if (state.loading) {
    stopGeneration();
    return;
  }
  sendMessage();
}

function handleGlobalShortcut(event) {
  if (event.key === "Escape" && DOM.toolsPopover.hasAttribute("data-fallback-open")) {
    hideToolsPopover();
    return;
  }

  const command = event.metaKey || event.ctrlKey;
  if (command && event.key.toLowerCase() === "k") {
    event.preventDefault();
    createChat();
  }
  if (command && event.key === "/") {
    event.preventDefault();
    openMobileSidebar();
    DOM.chatSearchInput.focus();
  }
  if (command && event.key === ",") {
    event.preventDefault();
    openSettings();
    return;
  }

  const target = event.target;
  const isEditable = target instanceof HTMLElement
    && Boolean(target.closest("input, textarea, select, button, [contenteditable='true']"));
  const isPrintable = event.key.length === 1
    && !event.metaKey
    && !event.ctrlKey
    && !event.altKey;

  if (
    DOM.app.classList.contains("isEmpty")
    && isPrintable
    && !isEditable
    && !document.querySelector("dialog[open]")
  ) {
    event.preventDefault();
    DOM.input.focus({ preventScroll: true });
    const start = DOM.input.selectionStart ?? DOM.input.value.length;
    const end = DOM.input.selectionEnd ?? start;
    DOM.input.setRangeText(event.key, start, end, "end");
    DOM.input.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function resizeTextarea() {
  DOM.input.style.height = "0";
  DOM.input.style.height = `${Math.min(DOM.input.scrollHeight, 192)}px`;
}

function scheduleTextareaResize() {
  if (textareaResizeFrame) return;
  textareaResizeFrame = requestAnimationFrame(() => {
    textareaResizeFrame = null;
    resizeTextarea();
  });
}

function handleChatScroll() {
  const scrollTop = Math.max(0, DOM.chatViewport.scrollTop);
  const distance = Math.max(0, DOM.chatViewport.scrollHeight - scrollTop - DOM.chatViewport.clientHeight);
  const movedUp = scrollTop < lastChatScrollTop - 1;
  const reachedBottom = distance <= 8;

  if (movedUp) {
    userPausedScroll = true;
  } else if (reachedBottom) {
    userPausedScroll = false;
  } else if (distance > 120) {
    userPausedScroll = true;
  }

  lastChatScrollTop = scrollTop;
  DOM.scrollBottomBtn.hidden = distance < 240;
}

function handleChatWheel(event) {
  if (event.deltaY < 0) userPausedScroll = true;
}

function handleChatTouchStart(event) {
  touchScrollY = event.touches[0]?.clientY ?? null;
}

function handleChatTouchMove(event) {
  const nextY = event.touches[0]?.clientY;
  if (touchScrollY !== null && typeof nextY === "number" && nextY > touchScrollY + 1) {
    userPausedScroll = true;
  }
  touchScrollY = typeof nextY === "number" ? nextY : touchScrollY;
}

function clearChatTouch() {
  touchScrollY = null;
}

function scrollBottom({ behavior = "auto", force = false } = {}) {
  if (!force && userPausedScroll) return;
  DOM.chatViewport.scrollTo({ top: DOM.chatViewport.scrollHeight, behavior });
  if (force) userPausedScroll = false;
}

function updateNetworkStatus() {
  const online = navigator.onLine;
  DOM.offlineBanner.hidden = online;
  DOM.connectionStatus.classList.toggle("offline", !online);
  DOM.connectionStatus.lastChild.textContent = online ? "Online" : "Offline";
  updateComposerState();
}

function updateViewportHeight() {
  const height = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${height}px`);
}

function toggleSidebarCollapse() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  DOM.app.classList.toggle("sidebarCollapsed", state.sidebarCollapsed);
  DOM.sidebarCollapseBtn.textContent = state.sidebarCollapsed ? "›" : "‹";
  DOM.sidebarCollapseBtn.setAttribute("aria-label", state.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar");
  persist();
}

function openMobileSidebar() {
  DOM.sidebar.classList.add("mobileOpen");
  DOM.sidebarBackdrop.hidden = false;
  requestAnimationFrame(() => DOM.sidebarBackdrop.classList.add("visible"));
}

function closeMobileSidebar() {
  DOM.sidebar.classList.remove("mobileOpen");
  DOM.sidebarBackdrop.classList.remove("visible");
  setTimeout(() => {
    if (!DOM.sidebar.classList.contains("mobileOpen")) DOM.sidebarBackdrop.hidden = true;
  }, 180);
}

function setupChatPagination() {
  if (!("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting || DOM.chatListSentinel.hidden) return;
    visibleChatCount += CONFIG.CHAT_BATCH_SIZE;
    renderChats();
  }, { root: DOM.chatList, rootMargin: "120px" });
  observer.observe(DOM.chatListSentinel);
}

function askForText({
  eyebrow,
  title,
  label,
  value = "",
  placeholder = "",
  submitLabel = "Continue"
}) {
  if (activePromptResolver) {
    activePromptResolver(null);
    activePromptResolver = null;
  }

  DOM.promptEyebrow.textContent = eyebrow;
  DOM.promptTitle.textContent = title;

  const labelTextNode = [...DOM.promptLabel.childNodes]
    .find(node => node.nodeType === Node.TEXT_NODE);

  if (labelTextNode) labelTextNode.textContent = label;
  else DOM.promptLabel.prepend(document.createTextNode(label));

  DOM.promptInput.value = value;
  DOM.promptInput.placeholder = placeholder;
  DOM.promptSubmitBtn.textContent = submitLabel;

  if (!DOM.promptDialog.open) DOM.promptDialog.showModal();

  requestAnimationFrame(() => {
    DOM.promptInput.focus();
    DOM.promptInput.select();
  });

  return new Promise(resolve => {
    activePromptResolver = resolve;
  });
}

function submitPromptDialog(event) {
  event.preventDefault();

  const value = DOM.promptInput.value.trim();
  if (!value) {
    DOM.promptInput.focus();
    return;
  }

  const resolve = activePromptResolver;
  activePromptResolver = null;
  DOM.promptDialog.close();
  resolve?.(value);
}

function cancelPromptDialog() {
  const resolve = activePromptResolver;
  activePromptResolver = null;

  if (DOM.promptDialog.open) DOM.promptDialog.close();
  resolve?.(null);
}

function hideToolsPopover() {
  if (typeof DOM.toolsPopover.hidePopover === "function") DOM.toolsPopover.hidePopover();
  DOM.toolsPopover.removeAttribute("data-fallback-open");
  DOM.toolsBtn.setAttribute("aria-expanded", "false");
}

function toggleToolsFallback() {
  if (DOM.toolsPopover.hasAttribute("data-fallback-open")) {
    DOM.toolsPopover.removeAttribute("data-fallback-open");
    DOM.toolsBtn.setAttribute("aria-expanded", "false");
  } else {
    DOM.toolsPopover.setAttribute("data-fallback-open", "");
    DOM.toolsBtn.setAttribute("aria-expanded", "true");
  }
}

function handleDocumentClick(event) {
  if (
    DOM.toolsPopover.hasAttribute("data-fallback-open")
    && !DOM.toolsPopover.contains(event.target)
    && !DOM.toolsBtn.contains(event.target)
  ) {
    hideToolsPopover();
  }
}

function addRipple(event) {
  const button = event.target.closest(".ripple");
  if (!button || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const bounds = button.getBoundingClientRect();
  const ripple = element("span", "rippleEffect");
  ripple.style.left = `${event.clientX - bounds.left}px`;
  ripple.style.top = `${event.clientY - bounds.top}px`;
  button.append(ripple);
  setTimeout(() => ripple.remove(), 550);
}

function toast(message, type = "success") {
  const item = element("div", `toast ${type}`);
  item.textContent = message;
  DOM.toastRegion.append(item);
  requestAnimationFrame(() => item.classList.add("visible"));
  setTimeout(() => {
    item.classList.remove("visible");
    setTimeout(() => item.remove(), 200);
  }, 2800);
}

function announce(message) {
  DOM.announcer.textContent = "";
  requestAnimationFrame(() => { DOM.announcer.textContent = message; });
}

async function copyText(text) {
  const value = String(text || "");
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through for browsers that expose Clipboard API but deny access.
    }
  }

  const activeElement = document.activeElement;
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  textarea.setAttribute("readonly", "");
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  activeElement?.focus?.({ preventScroll: true });
  if (!copied) throw new Error("Clipboard copy failed");
}

function persist() {
  if (persistTimer || persistIdleHandle) return;

  if ("requestIdleCallback" in window) {
    persistIdleHandle = window.requestIdleCallback(() => {
      persistIdleHandle = null;
      saveStoredState(state);
    }, { timeout: 1000 });
    return;
  }

  persistTimer = setTimeout(() => {
    persistTimer = null;
    saveStoredState(state);
  }, 120);
}

function flushPersist() {
  if (persistTimer) clearTimeout(persistTimer);
  if (persistIdleHandle && "cancelIdleCallback" in window) {
    window.cancelIdleCallback(persistIdleHandle);
  }
  persistTimer = null;
  persistIdleHandle = null;
  saveStoredState(state);
}

function createChatTitle(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 42 ? `${clean.slice(0, 42).trim()}…` : clean;
}

function getReadingMetrics(text) {
  const words = stripMarkdown(text).trim().split(/\s+/).filter(Boolean).length;
  if (!words) return "";
  const minutes = Math.max(1, Math.ceil(words / 220));
  return `${words.toLocaleString()} words · ${minutes} min read`;
}

function stripMarkdown(text) {
  return String(text)
    .replace(/```[\s\S]*?```/g, match => match.replace(/```[^\n]*\n?|```/g, ""))
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[*_#>`~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(timestamp);
}

function formatRelativeTime(timestamp) {
  const elapsed = Date.now() - Number(timestamp || Date.now());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(timestamp);
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "talkaton-response";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function element(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function byId(id) {
  return document.getElementById(id);
}

function getClientTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function getSupabase() {
  if (!supabasePromise) {
    supabasePromise = import("https://esm.sh/@supabase/supabase-js@2").then(({ createClient }) => {
      const client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
      client.auth.onAuthStateChange((event, session) => {
        if ((loginConfirmationPending || signupConfirmationPending) && event === "SIGNED_IN") return;
        state.user = session?.user || null;
        state.loggedIn = Boolean(session?.user);
        if (event === "PASSWORD_RECOVERY") {
          passwordRecoveryPending = true;
          openPasswordRecoveryDialog();
        } else if (
          event === "SIGNED_IN"
          && new URLSearchParams(window.location.search).get("signup-confirmed") === "1"
        ) {
          completeEmailSignupConfirmation();
        } else if (
          event === "SIGNED_IN"
          && new URLSearchParams(window.location.search).get("login-confirmed") === "1"
        ) {
          completeEmailLoginConfirmation();
        } else if (event === "SIGNED_OUT") {
          passwordRecoveryPending = false;
          if (DOM.passwordResetDialog.open) DOM.passwordResetDialog.close();
          if (DOM.profileDialog.open) DOM.profileDialog.close();
        }
        updateAccount();
      });
      return client;
    });
  }
  return supabasePromise;
}

window.addEventListener("beforeunload", flushPersist);
setInterval(() => {
  if (!state.loading) persist();
}, 15_000);
