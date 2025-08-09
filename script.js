// ===== elements =====
const chatBody = document.querySelector(".chat-body");
const messageInput = document.querySelector(".message-input");
const sendMessageButton = document.querySelector("#send-message");
const attachBtn = document.querySelector("#btn-attach");
const cameraBtn = document.querySelector("#btn-camera");
const inputAttach = document.querySelector("#file-attach");
const inputCamera = document.querySelector("#file-camera");
const formEl = document.querySelector(".chat-form"); // 👈 used to toggle has-attachments

// tiny UX: keep your icon text
if (sendMessageButton) {
  const label = sendMessageButton.textContent.trim() || "arrow_upward";
  sendMessageButton.textContent = label;
}

// ===== Gemini config =====
const API_KEY = "AIzaSyDjWSYA7pDcUiddC3SvhJnxTXBAie1j4WE"; // ⚠️ don't expose in prod
const API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

// ===== state =====
const userData = { message: null };
let selectedImages = []; // [{file, b64}]
const MAX_SIZE_MB = 8;

// One-time guardrails so you don't repeat "Healthy Planet" every line
const SYSTEM_INSTRUCTION = `You are a helpful assistant for Healthy Planet Canada.
Answer questions about Healthy Planet stores, products, supplements, returns, or related services.
If the topic is clearly unrelated, gently say: "I'm here to help with Healthy Planet Canada. Please ask something related to it."
Continue the conversation naturally without asking the user to repeat context. Keep replies concise and friendly.`;

let chatHistory = [{ role: "user", parts: [{ text: SYSTEM_INSTRUCTION }] }];
const MAX_TURNS = 12;
const trimHistory = () => {
  const keep = 1 + Math.min(chatHistory.length - 1, MAX_TURNS * 2);
  if (chatHistory.length > keep) {
    chatHistory = [chatHistory[0], ...chatHistory.slice(-keep + 1)];
  }
};

// ===== helpers =====
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
      alert(`${file.name} is larger than ${MAX_SIZE_MB} MB and was skipped.`);
      continue;
    }
    selectedImages.push({ file, b64: await fileToBase64(file) });
  }
  // 👇 show the Send button even if textarea is empty
  if (selectedImages.length) formEl.classList.add("has-attachments");
};

// ===== image buttons =====
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

// ===== call Gemini =====
const generateBotResponse = async (incomingMessageDiv) => {
  const messageElement = incomingMessageDiv.querySelector(".message-text");

  // attach current images to the most recent user turn
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
    // clear images for next round & reset send-visibility toggle
    selectedImages = [];
    formEl.classList.remove("has-attachments"); // 👈 hide Send if no text now
    incomingMessageDiv.classList.remove("thinking");
    chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
  }
};

// ===== send flow =====
const handleOutgoingMessage = (e) => {
  e.preventDefault();
  userData.message = messageInput.value.trim();

  // allow send if we have text OR images
  if (!userData.message && selectedImages.length === 0) return;

  // user bubble (text)
  const messageContent = `<div class="message-text"></div>`;
  const outgoingMessageDiv = createMessageElement(messageContent, "user-message");
  outgoingMessageDiv.querySelector(".message-text").textContent =
    userData.message || "(sent image)";
  chatBody.appendChild(outgoingMessageDiv);

  // user bubble (image previews)
  if (selectedImages.length) {
    const imgWrap = document.createElement("div");
    Object.assign(imgWrap.style, {
      display: "flex",
      flexWrap: "wrap",
      gap: "8px",
      marginTop: "8px"
    });
    selectedImages.forEach(({ file }) => {
      const url = URL.createObjectURL(file);
      const img = document.createElement("img");
      Object.assign(img.style, {
        width: "120px",
        height: "120px",
        objectFit: "cover",
        borderRadius: "12px",
        border: "1px solid #e5e7eb"
      });
      img.src = url;
      img.alt = file.name;
      imgWrap.appendChild(img);
    });
    outgoingMessageDiv.appendChild(imgWrap);
  }

  // add user turn to history (images merged in generateBotResponse)
  chatHistory.push({ role: "user", parts: [{ text: userData.message || "" }] });
  trimHistory();

  // reset input + scroll
  messageInput.value = "";
  chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });

  // thinking bubble
  const botThinkingContent = `
    <svg class="bot-avatar" width="40" height="40" viewBox="0 0 50 50">
      <circle cx="25" cy="25" r="20" fill="#45B94E"/>
    </svg>
    <div class="message-text">
      <div class="thinking-indicator">
        <div class="dot"></div><div class="dot"></div><div class="dot"></div>
      </div>
    </div>
  `;
  const incomingMessageDiv = createMessageElement(
    botThinkingContent,
    "bot-message",
    "thinking"
  );
  chatBody.appendChild(incomingMessageDiv);
  chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });

  // call API
  generateBotResponse(incomingMessageDiv);
};

// ===== listeners =====
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && (messageInput.value.trim() || selectedImages.length)) {
    handleOutgoingMessage(e);
  }
});
sendMessageButton.addEventListener("click", (e) => handleOutgoingMessage(e));
