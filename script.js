// ===== Floating open/close =====
const launcher = document.getElementById("chat-launcher");
const chatbot = document.getElementById("chatbot");
const minimizeBtn = document.getElementById("minimize-chat");

function openChat(){ chatbot.classList.add("open"); chatbot.setAttribute("aria-hidden","false"); }
function closeChat(){ chatbot.classList.remove("open"); chatbot.setAttribute("aria-hidden","true"); }

launcher.addEventListener("click", () => chatbot.classList.contains("open") ? closeChat() : openChat());
minimizeBtn.addEventListener("click", closeChat);

// Open by default on first load
window.addEventListener("load", openChat);

// ===== Elements =====
const chatBody = document.querySelector(".chat-body");
const messageInput = document.querySelector(".message-input");
const sendMessageButton = document.querySelector("#send-message");
const attachBtn = document.querySelector("#btn-attach");
const cameraBtn = document.querySelector("#btn-camera");
const emojiBtn = document.querySelector("#btn-emoji");
const inputAttach = document.querySelector("#file-attach");
const inputCamera = document.querySelector("#file-camera");
const formEl = document.querySelector(".chat-form");

// ===== Gemini config =====
const API_KEY = "YOUR_GEMINI_API_KEY_HERE"; // ⚠️ Replace + proxy in production
const API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

// ===== State =====
const userData = { message: null };
let selectedImages = []; // [{file, b64}]
const MAX_SIZE_MB = 8;

const SYSTEM_INSTRUCTION = `You are a helpful assistant for Healthy Planet Canada.
Stay focused on Healthy Planet stores, products, supplements, returns, or related services.
If the topic is unrelated, gently say: "I'm here to help with Healthy Planet Canada. Please ask something related to it."
Continue the conversation naturally without asking the user to repeat context. Keep replies concise and friendly.`;

let chatHistory = [{ role: "user", parts: [{ text: SYSTEM_INSTRUCTION }] }];
const MAX_TURNS = 12;
const trimHistory = () => {
  const keep = 1 + Math.min(chatHistory.length - 1, MAX_TURNS * 2);
  if (chatHistory.length > keep) chatHistory = [chatHistory[0], ...chatHistory.slice(-keep + 1)];
};

// ===== Helpers =====
const createMessageElement = (content, ...classes) => {
  const div = document.createElement("div");
  div.classList.add("message", ...classes);
  div.innerHTML = content;
  return div;
};

const cleanBotText = (raw = "") =>
  raw
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ""))
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1]);
  r.onerror = reject;
  r.readAsDataURL(file);
});

const addFiles = async (fileList) => {
  const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
  for (const file of files) {
    if (file.size > MAX_SIZE_MB * 1024 * 1024) { alert(`${file.name} is larger than ${MAX_SIZE_MB} MB`); continue; }
    selectedImages.push({ file, b64: await fileToBase64(file) });
  }
  if (selectedImages.length) formEl.classList.add("has-attachments");
};

// Insert emoji at cursor
function insertAtCursor(el, text){
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0,start) + text + el.value.slice(end);
  const pos = start + text.length;
  el.setSelectionRange(pos, pos);
  el.dispatchEvent(new Event('input', { bubbles: true })); // update :valid for Send button
}

// ===== Typing animation (first greeting only) =====
function typeMessage(text) {
  const msgDiv = document.createElement("div");
  msgDiv.classList.add("message", "bot-message");
  msgDiv.innerHTML = `<div class="message-text"></div>`;
  chatBody.appendChild(msgDiv);

  const el = msgDiv.querySelector(".message-text");
  let i = 0;
  const timer = setInterval(() => {
    el.textContent = text.slice(0, i++);
    chatBody.scrollTop = chatBody.scrollHeight;
    if (i > text.length) clearInterval(timer);
  }, 24);
}

// Initial greeting
window.addEventListener("load", () => {
  typeMessage("Hey there 👋😊\nWelcome to Healthy Planet Canada Online Assistant.\nHow can I help you today?");
});

// ===== Image + Emoji buttons =====
attachBtn?.addEventListener("click", () => inputAttach.click());
cameraBtn?.addEventListener("click", () => inputCamera.click());
inputAttach.addEventListener("change", async (e) => { await addFiles(e.target.files); inputAttach.value = ""; });
inputCamera.addEventListener("change", async (e) => { await addFiles(e.target.files); inputCamera.value = ""; });

// Emoji picker (Emoji Button)
let emojiPicker;
if (window.EmojiButton) {
  emojiPicker = new EmojiButton({ position: 'top-end', zIndex: 2000 });
  emojiPicker.on('emoji', emoji => {
    insertAtCursor(messageInput, emoji);
    messageInput.focus();
  });
  emojiBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    emojiPicker.togglePicker(emojiBtn);
  });
}

// ===== Gemini call =====
const generateBotResponse = async (incomingMessageDiv) => {
  const messageElement = incomingMessageDiv.querySelector(".message-text");

  // Attach images to most recent user turn
  let lastUser = -1;
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    if (chatHistory[i].role === "user") { lastUser = i; break; }
  }
  if (lastUser !== -1 && selectedImages.length) {
    const imageParts = selectedImages.map(({ file, b64 }) => ({
      inline_data: { mime_type: file.type || "image/*", data: b64 }
    }));
    const parts = chatHistory[lastUser].parts || [];
    chatHistory[lastUser] = { role: "user", parts: [...imageParts, ...parts] };
  }

  const requestOptions = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: chatHistory })
  };

  try {
    const response = await fetch(API_URL, requestOptions);
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "Request failed");

    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const apiResponseText = cleanBotText(raw);
    messageElement.innerText = apiResponseText;

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
  userData.message = messageInput.value.trim();

  // open if minimized
  openChat();

  // allow sending if text or images present
  if (!userData.message && selectedImages.length === 0) return;

  // user bubble (text)
  const messageContent = `<div class="message-text"></div>`;
  const outgoingMessageDiv = createMessageElement(messageContent, "user-message");
  outgoingMessageDiv.querySelector(".message-text").textContent =
    userData.message || "(sent image)";
  chatBody.appendChild(outgoingMessageDiv);

  // previews
  if (selectedImages.length) {
    const imgWrap = document.createElement("div");
    imgWrap.className = "image-preview-wrap";
    Object.assign(imgWrap.style, { display:"flex", flexWrap:"wrap", gap:"8px", marginTop:"8px" });
    selectedImages.forEach(({ file }) => {
      const url = URL.createObjectURL(file);
      const img = document.createElement("img");
      Object.assign(img.style, {
        width:"120px", height:"120px", objectFit:"cover",
        borderRadius:"12px", border:"1px solid #e5e7eb"
      });
      img.src = url; img.alt = file.name;
      imgWrap.appendChild(img);
    });
    outgoingMessageDiv.appendChild(imgWrap);
  }

  // add to history (images are merged in generateBotResponse)
  chatHistory.push({ role: "user", parts: [{ text: userData.message || "" }] });
  trimHistory();

  // reset input + scroll
  messageInput.value = "";
  chatBody.scrollTop = chatBody.scrollHeight;

  // thinking bubble
  const botThinkingContent = `
    <div class="message-text">
      <div class="thinking-indicator">
        <div class="dot"></div><div class="dot"></div><div class="dot"></div>
      </div>
    </div>
  `;
  const incomingMessageDiv = createMessageElement(botThinkingContent, "bot-message", "thinking");
  chatBody.appendChild(incomingMessageDiv);
  chatBody.scrollTop = chatBody.scrollHeight;

  generateBotResponse(incomingMessageDiv);
};

// Submit + Enter to send
document.querySelector(".chat-form").addEventListener("submit", handleOutgoingMessage);
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    handleOutgoingMessage(e);
  }
});
