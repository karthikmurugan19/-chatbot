// =================== elements ===================
const chatBody = document.querySelector(".chat-body");
const messageInput = document.querySelector(".message-input");
const sendMessageButton = document.querySelector("#send-message");

// Optional: buttons for attach/capture (create these in HTML if you have icons)
// <button id="btn-attach" type="button">📎</button>
// <button id="btn-camera" type="button">📷</button>
const attachBtn = document.querySelector("#btn-attach");
const cameraBtn = document.querySelector("#btn-camera");

// Hidden file inputs (auto-created if not present)
let inputAttach = document.querySelector("#file-attach");
let inputCamera = document.querySelector("#file-camera");

if (!inputAttach) {
  inputAttach = document.createElement("input");
  inputAttach.type = "file";
  inputAttach.accept = "image/*";
  inputAttach.multiple = true;
  inputAttach.id = "file-attach";
  inputAttach.hidden = true;
  document.body.appendChild(inputAttach);
}
if (!inputCamera) {
  inputCamera = document.createElement("input");
  inputCamera.type = "file";
  inputCamera.accept = "image/*";
  inputCamera.capture = "environment"; // opens rear camera on mobile
  inputCamera.id = "file-camera";
  inputCamera.hidden = true;
  document.body.appendChild(inputCamera);
}

// Add a tiny emoji to the send button (once)
if (sendMessageButton) {
  const label = sendMessageButton.textContent.trim() || "Send";
  sendMessageButton.textContent = `${label} ✉️`;
}

// =================== Gemini config ===================
const API_KEY = "AIzaSyDjWSYA7pDcUiddC3SvhJnxTXBAie1j4WE"; // ⚠️ do not ship keys in production
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

// =================== state ===================
const userData = { message: null };
let selectedImages = []; // [{file, b64}]
const MAX_SIZE_MB = 8;

// One-time instruction so you don't repeat "Healthy Planet" each line
const SYSTEM_INSTRUCTION = `You are a helpful assistant for Healthy Planet Canada.
Stay focused on Healthy Planet stores, products, supplements, returns, or related services.
If the topic is clearly unrelated, gently say: "I'm here to help with Healthy Planet Canada. Please ask something related to it."
Continue the conversation naturally without asking the user to repeat context. Keep answers concise and helpful.`;

let chatHistory = [
  { role: "user", parts: [{ text: SYSTEM_INSTRUCTION }] }
];

// cap history length to keep requests light (instruction + last N turns)
const MAX_TURNS = 12;
const trimHistory = () => {
  const keep = 1 + Math.min(chatHistory.length - 1, MAX_TURNS * 2);
  if (chatHistory.length > keep) {
    chatHistory = [chatHistory[0], ...chatHistory.slice(-keep + 1)];
  }
};

// =================== helpers ===================
const createMessageElement = (content, ...classes) => {
  const div = document.createElement("div");
  div.classList.add("message", ...classes);
  div.innerHTML = content;
  return div;
};

const cleanBotText = (raw = "") =>
  raw
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, "")) // keep inner text
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
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]); // strip data: prefix
    reader.onerror = reject;
    reader.readAsDataURL(file);
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
};

// =================== image inputs ===================
if (attachBtn) attachBtn.addEventListener("click", () => inputAttach.click());
if (cameraBtn) cameraBtn.addEventListener("click", () => inputCamera.click());

inputAttach.addEventListener("change", async (e) => {
  await addFiles(e.target.files);
  inputAttach.value = "";
});
inputCamera.addEventListener("change", async (e) => {
  await addFiles(e.target.files);
  inputCamera.value = "";
});

// =================== bot call ===================
const generateBotResponse = async (incomingMessageDiv) => {
  const messageElement = incomingMessageDiv.querySelector(".message-text");

  // If user attached images this turn, include them with the most recent user message.
  // Build the "current" turn from the last user entry in chatHistory + images.
  let lastIdx = -1;
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    if (chatHistory[i].role === "user") { lastIdx = i; break; }
  }
  if (lastIdx !== -1 && selectedImages.length) {
    const parts = chatHistory[lastIdx].parts || [];
    const imageParts = selectedImages.map(({ file, b64 }) => ({
      inline_data: { mime_type: file.type || "image/*", data: b64 }
    }));
    chatHistory[lastIdx] = { role: "user", parts: [...imageParts, ...parts] };
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

    // push assistant turn
    chatHistory.push({ role: "model", parts: [{ text: apiResponseText }] });
    trimHistory();
  } catch (error) {
    console.error("❌ API Error:", error);
    messageElement.innerText = "⚠️ Something went wrong. Please try again later.";
  } finally {
    // clear images for next user turn
    selectedImages = [];
    incomingMessageDiv.classList.remove("thinking");
    chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
  }
};

// =================== send flow ===================
const handleOutgoingMessage = (e) => {
  e.preventDefault();
  userData.message = messageInput.value.trim();

  // allow sending if we have text OR images
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
    imgWrap.style.display = "flex";
    imgWrap.style.flexWrap = "wrap";
    imgWrap.style.gap = "8px";
    imgWrap.style.marginTop = "8px";
    selectedImages.forEach(({ file }) => {
      const url = URL.createObjectURL(file);
      const img = document.createElement("img");
      img.src = url;
      img.alt = file.name;
      img.style.width = "120px";
      img.style.height = "120px";
      img.style.objectFit = "cover";
      img.style.borderRadius = "12px";
      img.style.border = "1px solid #e5e7eb";
      imgWrap.appendChild(img);
    });
    outgoingMessageDiv.appendChild(imgWrap);
  }

  // add user turn to history (text for now; images will be merged in generateBotResponse)
  if (userData.message) {
    chatHistory.push({ role: "user", parts: [{ text: userData.message }] });
  } else {
    // if only images and no text, still push an empty text so the images can be attached to this turn
    chatHistory.push({ role: "user", parts: [{ text: "" }] });
  }
  trimHistory();

  // reset input + scroll
  messageInput.value = "";
  chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });

  // bot thinking bubble
  const botThinkingContent = `
    <svg class="bot-avatar" width="40" height="40" viewBox="0 0 50 50" aria-hidden="true">
      <circle cx="25" cy="25" r="20" fill="#45B94E"></circle>
    </svg>
    <div class="message-text">
      <div class="thinking-indicator">
        <div class="dot"></div><div class="dot"></div><div class="dot"></div>
      </div>
    </div>
  `;
  const incomingMessageDiv = createMessageElement(botThinkingContent, "bot-message", "thinking");
  chatBody.appendChild(incomingMessageDiv);
  chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });

  // call API
  generateBotResponse(incomingMessageDiv);
};

// =================== listeners ===================
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (messageInput.value.trim() || selectedImages.length)) {
    handleOutgoingMessage(e);
  }
});
sendMessageButton.addEventListener("click", (e) => handleOutgoingMessage(e));

// (optional) expose file add function if you add a paperclip somewhere else:
window.addChatbotImages = async (files) => addFiles(files);
