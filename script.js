// IMPORTANT: load as type="module" in index.html

// --- Mobile viewport height fix (iOS/Android address bar) ---
function setAppHeight() {
  const vh = window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${vh}px`);
}
window.addEventListener("resize", setAppHeight);
window.addEventListener("orientationchange", setAppHeight);
setAppHeight();

// ===== UI open/close (chat opens by default) =====
const chatbot = document.getElementById("chatbot");
const bubble = document.getElementById("chat-bubble");
const minimizeBtn = document.getElementById("minimize-chat");

function openChat() {
  chatbot.classList.add("open");
  chatbot.setAttribute("aria-hidden", "false");
  bubble.hidden = true;
}
function closeChat() {
  chatbot.classList.remove("open");
  chatbot.setAttribute("aria-hidden", "true");
  bubble.hidden = false;
}
openChat();
bubble.addEventListener("click", openChat);
minimizeBtn.addEventListener("click", closeChat);

// ===== Elements =====
const chatBody = document.querySelector(".chat-body");
const messageInput = document.querySelector(".message-input");
const attachBtn = document.querySelector("#btn-attach");
const cameraBtn = document.querySelector("#btn-camera");
const inputAttach = document.querySelector("#file-attach");
const inputCamera = document.querySelector("#file-camera");
const formEl = document.querySelector(".chat-form");

// ===== Config / Constants =====
const API_KEY = "AIzaSyDjWSYA7pDcUiddC3SvhJnxTXBAie1j4WE"; // ⚠️ Replace + proxy in production
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

const STORE_LOCATOR_URL = "https://www.healthyplanetcanada.com/storelocator";
const RETURN_POLICY_URL = "https://www.healthyplanetcanada.com/return-policy";

// Expanded system instruction (incl. produce & dairy)
const SYSTEM_INSTRUCTION = `
You are a helpful assistant for Healthy Planet Canada.

Scope:
- Focus on Healthy Planet stores, products, groceries, supplements, returns, or related services.
- You may also answer questions about grocery items, including fresh produce and dairy (e.g., availability in general, nutrition, ingredients, storage/handling, substitutions, dietary/lifestyle fit).

If out of scope:
- If the topic is unrelated, gently say: "I'm here to help with Healthy Planet Canada. Please ask something related to it."

Style:
- Continue the conversation naturally without asking the user to repeat context.
- Keep replies concise, friendly, and actionable.
- Do NOT ask users to wait or say you'll get back later. Answer immediately with what you know and then ask helpful follow-up if needed.
- If uncertain, do not guess—say so briefly and ask a clarifying question.

Operational info & policies:
- For store information (hours, address, phone, directions), direct users to the Store Locator and offer to help if they share a city or postal code:
  ${STORE_LOCATOR_URL}
- For return/refund details, refer to the Return Policy:
  ${RETURN_POLICY_URL}

Accuracy:
- Do not invent or guess answers. If unsure, state that and ask a concise follow-up to resolve.
`;

let chatHistory = [{ role: "user", parts: [{ text: SYSTEM_INSTRUCTION }] }];
const MAX_TURNS = 12;
let selectedImages = []; // [{file, b64}]
const MAX_SIZE_MB = 8;

// ===== Helpers =====
const createMessageElement = (content, ...classes) => {
  const div = document.createElement("div");
  div.classList.add("message", ...classes);
  div.innerHTML = content;
  return div;
};

// Clean text but keep links (we'll linkify after typing)
const cleanBotText = (raw = "") =>
  raw
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ""))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\b(please\s+wait|hang\s+tight|hold\s+on|give\s+me\s+a\s+moment|one\s+moment|i['’]ll\s+get\s+back\s+to\s+you)[^.!?]*[.!?]/gi, "")
    .trim();

const escapeHTML = (s = "") =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const markdownLinksToAnchors = (text = "") =>
  text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) =>
    `<a href="${url}" target="_blank" rel="noopener">${label}</a>`);

const urlToAnchors = (text = "") =>
  text.replace(/(?:https?:\/\/|www\.)[^\s)]+/g, (url) => {
    const href = url.startsWith("http") ? url : `https://${url}`;
    return `<a href="${href}" target="_blank" rel="noopener">${url}</a>`;
  });

// Escape first, then only add <a> tags
const linkify = (plainText = "") => {
  const safe = escapeHTML(plainText);
  return urlToAnchors(markdownLinksToAnchors(safe));
};

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

const addFiles = async (fileList) => {
  const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
  for (const file of files) {
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      alert(`${file.name} is larger than ${MAX_SIZE_MB} MB`);
      continue;
    }
    selectedImages.push({ file, b64: await fileToBase64(file) });
  }
  if (selectedImages.length) formEl.classList.add("has-attachments");
};

function typeInto(el, text, speed = 16) {
  return new Promise((resolve) => {
    let i = 0;
    const t = setInterval(() => {
      el.textContent = text.slice(0, i++);
      chatBody.scrollTop = chatBody.scrollHeight;
      if (i > text.length) {
        clearInterval(t);
        resolve();
      }
    }, speed);
  });
}

const trimHistory = () => {
  const keep = 1 + Math.min(chatHistory.length - 1, MAX_TURNS * 2);
  if (chatHistory.length > keep) chatHistory = [chatHistory[0], ...chatHistory.slice(-keep + 1)];
};

// Store info/hours detection → shortcut to locator
const isStoreInfoQuery = (text = "") => {
  const t = text.toLowerCase();
  return (
    /(store|location|branch|shop|near|address|directions|map|number|phone|contact).*(hour|open|close|time|today|holiday)/.test(t) ||
    /(hours?\s+of\s+(operation|opening|closing)|store\s*hours|opening\s*hours|closing\s*time)/.test(t) ||
    /(what\s*time|when)\s+(do|does|are)\s+(you|the\s+store)\s+(open|close)/.test(t)
  );
};

const storeLocatorReply =
  `For the most accurate store details (hours, address, phone), please use the Store Locator:\n${STORE_LOCATOR_URL}\n` +
  `If you share your city or postal code, I can point you to the right page.`;

// ===== Greeting + inline FAQ (first bot message) =====
(async () => {
  const msgDiv = document.createElement("div");
  msgDiv.classList.add("message", "bot-message");
  msgDiv.innerHTML = `<div class="message-text"></div>`;
  chatBody.appendChild(msgDiv);

  const textEl = msgDiv.querySelector(".message-text");
  await typeInto(
    textEl,
    "Hey there 👋😊\nWelcome to Healthy Planet Canada Online Assistant.\nHow can I help you today?",
    14
  );

  // Inline FAQ under the first bot message (two links only)
  const faq = document.createElement("div");
  faq.className = "faq-inline";
  faq.innerHTML = `
    <span class="faq-label">Quick links:</span>
    <a href="${STORE_LOCATOR_URL}" target="_blank" rel="noopener">Store Locator & Hours</a>
    <span class="sep">•</span>
    <a href="${RETURN_POLICY_URL}" target="_blank" rel="noopener">Return & Refund Policy</a>
  `;
  textEl.appendChild(faq);
  chatBody.scrollTop = chatBody.scrollHeight;
})();

// ===== Image buttons =====
attachBtn?.addEventListener("click", () => inputAttach.click());
cameraBtn?.addEventListener("click", () => inputCamera.click());
inputAttach.addEventListener("change", async (e) => {
  await addFiles(e.target.files);
  inputAttach.value = "";
});
inputCamera.addEventListener("change", async (e) => {
  await addFiles(e.target.files);
  inputCamera.value = "";
});

// ===== Gemini call =====
const generateBotResponse = async (incomingMessageDiv) => {
  const messageElement = incomingMessageDiv.querySelector(".message-text");

  // Attach images to most recent user turn
  let lastUser = -1;
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    if (chatHistory[i].role === "user") {
      lastUser = i;
      break;
    }
  }
  if (lastUser !== -1 && selectedImages.length) {
    const imageParts = selectedImages.map(({ file, b64 }) => ({
      inline_data: { mime_type: file.type || "image/*", data: b64 },
    }));
    const parts = chatHistory[lastUser].parts || [];
    chatHistory[lastUser] = { role: "user", parts: [...imageParts, ...parts] };
  }

  const requestOptions = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: chatHistory }),
  };

  try {
    const response = await fetch(API_URL, requestOptions);
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "Request failed");

    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const apiResponseText = cleanBotText(raw);

    // Type the reply as text, then replace with linkified HTML
    await typeInto(messageElement, apiResponseText, 16);
    messageElement.innerHTML = linkify(apiResponseText);

    chatHistory.push({ role: "model", parts: [{ text: apiResponseText }] });
    trimHistory();
  } catch (err) {
    console.error("❌ API Error:", err);
    messageElement.innerText = "⚠️ Something went wrong. Please try again later.";
  } finally {
    selectedImages = [];
    formEl.classList.remove("has-attachments");
    incomingMessageDiv.classList.remove("thinking");
    chatBody.scrollTop = chatBody.scrollHeight;
  }
};

// ===== Send flow =====
const handleOutgoingMessage = (e) => {
  e.preventDefault();
  const userText = messageInput.value.trim();

  // ensure open
  openChat();

  // allow sending if text or images present
  if (!userText && selectedImages.length === 0) return;

  // user bubble
  const outgoingMessageDiv = createMessageElement(`<div class="message-text"></div>`, "user-message");
  outgoingMessageDiv.querySelector(".message-text").textContent = userText || "(sent image)";
  chatBody.appendChild(outgoingMessageDiv);

  // image previews
  if (selectedImages.length) {
    const imgWrap = document.createElement("div");
    imgWrap.className = "image-preview-wrap";
    Object.assign(imgWrap.style, { display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" });
    selectedImages.forEach(({ file }) => {
      const url = URL.createObjectURL(file);
      const img = document.createElement("img");
      Object.assign(img.style, {
        width: "120px",
        height: "120px",
        objectFit: "cover",
        borderRadius: "12px",
        border: "1px solid #e5e7eb",
      });
      img.src = url;
      img.alt = file.name;
      imgWrap.appendChild(img);
    });
    outgoingMessageDiv.appendChild(imgWrap);
  }

  // Add user turn to history (images merged later)
  chatHistory.push({ role: "user", parts: [{ text: userText || "" }] });
  trimHistory();

  // reset input + scroll
  messageInput.value = "";
  chatBody.scrollTop = chatBody.scrollHeight;

  // Shortcut: store info/hours → locator reply (with linkify)
  if (isStoreInfoQuery(userText)) {
    const botDiv = createMessageElement(`<div class="message-text"></div>`, "bot-message");
    chatBody.appendChild(botDiv);
    chatBody.scrollTop = chatBody.scrollHeight;

    (async () => {
      const el = botDiv.querySelector(".message-text");
      await typeInto(el, storeLocatorReply, 16);
      el.innerHTML = linkify(storeLocatorReply);
      chatHistory.push({ role: "model", parts: [{ text: storeLocatorReply }] });
      trimHistory();
    })();

    selectedImages = [];
    formEl.classList.remove("has-attachments");
    return;
  }

  // thinking bubble
  const botThinking = `
    <div class="message-text">
      <div class="thinking-indicator">
        <div class="dot"></div><div class="dot"></div><div class="dot"></div>
      </div>
    </div>`;
  const incomingMessageDiv = createMessageElement(botThinking, "bot-message", "thinking");
  chatBody.appendChild(incomingMessageDiv);
  chatBody.scrollTop = chatBody.scrollHeight;

  generateBotResponse(incomingMessageDiv);
};

// Submit + Enter to send
document.querySelector(".chat-form").addEventListener("submit", handleOutgoingMessage);
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) handleOutgoingMessage(e);
});
