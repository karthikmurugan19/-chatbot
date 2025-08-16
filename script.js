// IMPORTANT: this file is loaded with type="module" in index.html

// --- mobile viewport height fix (iOS/Android address bar) ---
function setAppHeight() {
  const vh = window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${vh}px`);
}
window.addEventListener('resize', setAppHeight);
window.addEventListener('orientationchange', setAppHeight);
setAppHeight();

// ===== UI open/close behavior (open by default) =====
const chatbot = document.getElementById("chatbot");
const bubble = document.getElementById("chat-bubble");
const minimizeBtn = document.getElementById("minimize-chat");

function openChat(){
  chatbot.classList.add("open");
  chatbot.setAttribute("aria-hidden","false");
  bubble.hidden = true;
}
function closeChat(){
  chatbot.classList.remove("open");
  chatbot.setAttribute("aria-hidden","true");
  bubble.hidden = false;
}

openChat(); // open on first load
bubble.addEventListener("click", openChat);
minimizeBtn.addEventListener("click", closeChat);

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
const API_KEY = "AIzaSyDjWSYA7pDcUiddC3SvhJnxTXBAie1j4WE"; // ⚠️ Replace + proxy in production
// Updated to use the stable gemini-2.0-flash model
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

// ===== State =====
const userData = { message: null };
let selectedImages = []; // [{file, b64}]
const MAX_SIZE_MB = 8;

const SYSTEM_INSTRUCTION = `You are a helpful assistant for Healthy Planet Canada.
Stay focused on Healthy Planet stores, products, supplements, returns, or related services.
If the topic is unrelated, gently say: "I'm here to help with Healthy Planet Canada. Please ask something related to it."
Continue the conversation naturally without asking the user to repeat context. Keep replies concise and friendly.

Critical policies:
- If a user asks about store information or operational hours, direct them to the Store Locator on the Healthy Planet Canada website. Offer to point them to the right page if they share their city or postal code.
- Do not invent or guess answers. If uncertain, say so briefly and ask a helpful follow-up question.
- Do NOT ask users to wait or say you'll get back later. Answer immediately with what you know and follow up with clarifying questions if needed.`;

// Fixed chat history initialization - don't include system instruction in ongoing conversation
let chatHistory = [];
const systemMessage = { role: "user", parts: [{ text: SYSTEM_INSTRUCTION }] };
const systemResponse = { role: "model", parts: [{ text: "I understand. I'm here to help with Healthy Planet Canada questions." }] };

const MAX_TURNS = 12;
const trimHistory = () => {
  // Keep system messages + last N conversation turns
  const keepTurns = MAX_TURNS * 2; // user + model pairs
  if (chatHistory.length > keepTurns) {
    chatHistory = chatHistory.slice(-keepTurns);
  }
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
    if (file.size > MAX_SIZE_MB * 1024 * 1024) { 
      alert(`${file.name} is larger than ${MAX_SIZE_MB} MB`); 
      continue; 
    }
    selectedImages.push({ file, b64: await fileToBase64(file) });
  }
  if (selectedImages.length) formEl.classList.add("has-attachments");
};

function insertAtCursor(el, text){
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0,start) + text + el.value.slice(end);
  const pos = start + text.length;
  el.setSelectionRange(pos, pos);
  el.dispatchEvent(new Event('input', { bubbles: true })); // update :valid for send visibility
}

// ===== Typing animation (greeting + all bot replies) =====
function typeInto(el, text, speed = 18){
  return new Promise((resolve) => {
    let i = 0;
    const t = setInterval(() => {
      el.textContent = text.slice(0, i++);
      chatBody.scrollTop = chatBody.scrollHeight;
      if (i > text.length) { clearInterval(t); resolve(); }
    }, speed);
  });
}

// Initial greeting
(async () => {
  const msgDiv = document.createElement("div");
  msgDiv.classList.add("message", "bot-message");
  msgDiv.innerHTML = `<div class="message-text"></div>`;
  chatBody.appendChild(msgDiv);
  await typeInto(
    msgDiv.querySelector(".message-text"),
    "Hey there 👋😊\nWelcome to Healthy Planet Canada Online Assistant.\nHow can I help you today?",
    14
  );
})();

// ===== Image + Emoji buttons =====
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

// Emoji Mart (dynamic import for GitHub Pages) - with error handling
let emojiPicker;
if (emojiBtn) {
  import('https://cdn.jsdelivr.net/npm/emoji-mart@latest/dist/browser.js')
    .then(({ Picker }) => {
      emojiPicker = new Picker({
        theme: 'light',
        skinTonePosition: 'none',
        searchPosition: 'none',
        previewPosition: 'none'
      });

      let pickerOpen = false;

      emojiBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!pickerOpen) {
          // Position it above the emoji button
          const rect = emojiBtn.getBoundingClientRect();
          emojiPicker.style.position = 'fixed';
          emojiPicker.style.right = `${window.innerWidth - rect.right}px`;
          emojiPicker.style.bottom = `${window.innerHeight - rect.top + 8}px`;
          emojiPicker.style.zIndex = '2000';
          document.body.appendChild(emojiPicker);
          pickerOpen = true;
        } else {
          emojiPicker.remove();
          pickerOpen = false;
        }
      });

      emojiPicker.addEventListener('emoji:select', (event) => {
        insertAtCursor(messageInput, event.emoji.native);
        messageInput.focus();
      });

      // Close picker if user clicks outside
      document.addEventListener('click', (ev) => {
        if (pickerOpen && !emojiPicker.contains(ev.target) && ev.target !== emojiBtn) {
          emojiPicker.remove();
          pickerOpen = false;
        }
      });
    })
    .catch(err => {
      console.warn("Emoji picker failed to load:", err);
      // Hide emoji button if it fails to load
      if (emojiBtn) emojiBtn.style.display = 'none';
    });
}

// ===== Gemini call =====
const generateBotResponse = async (incomingMessageDiv) => {
  const messageElement = incomingMessageDiv.querySelector(".message-text");

  try {
    // Build the request with proper structure
    const requestContents = [];
    
    // Add system instruction at the beginning if this is the first call
    if (chatHistory.length === 0) {
      requestContents.push(systemMessage);
      requestContents.push(systemResponse);
    }
    
    // Add conversation history
    requestContents.push(...chatHistory);

    const requestOptions = {
      method: "POST",
      headers: { 
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
        contents: requestContents,
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      })
    };

    const response = await fetch(API_URL, requestOptions);
    const data = await response.json();
    
    if (!response.ok) {
      console.error("API Error Response:", data);
      let errorMessage = "⚠️ Something went wrong. Please try again later.";
      
      if (data?.error?.message) {
        const errorMsg = data.error.message.toLowerCase();
        if (errorMsg.includes('api key') || errorMsg.includes('authentication')) {
          errorMessage = "⚠️ API authentication issue. Please check configuration.";
        } else if (errorMsg.includes('quota') || errorMsg.includes('limit')) {
          errorMessage = "⚠️ API quota exceeded. Please try again later.";
        } else if (errorMsg.includes('model') || errorMsg.includes('not found')) {
          errorMessage = "⚠️ Model not available. Please contact support.";
        } else if (errorMsg.includes('blocked') || errorMsg.includes('safety')) {
          errorMessage = "⚠️ Content was blocked for safety reasons. Please rephrase your message.";
        }
      }
      
      throw new Error(errorMessage);
    }

    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) {
      throw new Error("⚠️ Empty response from API. Please try again.");
    }

    const apiResponseText = cleanBotText(raw);

    // Type the reply
    await typeInto(messageElement, apiResponseText, 16);

    // Add to history
    chatHistory.push({ role: "model", parts: [{ text: apiResponseText }] });
    trimHistory();

  } catch (err) {
    console.error("❌ API Error:", err);
    messageElement.innerText = err.message || "⚠️ Something went wrong. Please try again later.";
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

  // ensure open
  openChat();

  // allow sending if text or images present
  if (!userData.message && selectedImages.length === 0) return;

  // user bubble (text)
  const messageContent = `<div class="message-text"></div>`;
  const outgoingMessageDiv = createMessageElement(messageContent, "user-message");
  outgoingMessageDiv.querySelector(".message-text").textContent =
    userData.message || "(sent image)";
  chatBody.appendChild(outgoingMessageDiv);

  // image previews
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

  // Build user message parts properly
  const userParts = [];
  
  // Add images first if any
  if (selectedImages.length) {
    selectedImages.forEach(({ file, b64 }) => {
      userParts.push({
        inline_data: {
          mime_type: file.type || "image/*",
          data: b64
        }
      });
    });
  }
  
  // Add text
  if (userData.message) {
    userParts.push({ text: userData.message });
  }

  // Add to history with proper structure
  chatHistory.push({ role: "user", parts: userParts });
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
