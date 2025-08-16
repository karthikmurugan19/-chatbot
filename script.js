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
  bubble.hidden = true; // Hide bubble when chat is open
}
function closeChat(){
  chatbot.classList.remove("open");
  chatbot.setAttribute("aria-hidden","true");
  bubble.hidden = false; // Show bubble when chat is closed
}

openChat(); // open on first load - bubble will be hidden
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
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

// ===== URLs =====
const STORE_LOCATOR_URL = "https://www.healthyplanetcanada.com/storelocator";
const RETURN_POLICY_URL = "https://www.healthyplanetcanada.com/return-policy";

// ===== State =====
const userData = { message: null };
let selectedImages = []; // [{file, b64, preview}]
const MAX_SIZE_MB = 8;

// Enhanced system instruction
const SYSTEM_INSTRUCTION = `You are a customer service assistant for Healthy Planet Canada, a health and wellness retail chain.

IDENTITY & SCOPE:
- You work for Healthy Planet Canada and help customers with our stores and products
- Focus ONLY on Healthy Planet Canada products, services, stores, and policies
- If asked about other retailers or unrelated topics, politely redirect: "I can only help with Healthy Planet Canada questions. What would you like to know about our stores or products?"
- Do NOT repeatedly mention that you're a Healthy Planet assistant - customers already know this

STORE & RETURN POLICY RESPONSES:
- For store-related questions (hours, locations, addresses, phone, directions): Naturally mention store locator: "You can find specific store details at our store locator: ${STORE_LOCATOR_URL}"
- For return/refund/exchange questions: Naturally mention return policy: "For complete return details, check our return policy: ${RETURN_POLICY_URL}"
- Integrate these links naturally into helpful responses, not as separate additions

HEALTHY PLANET CONTEXT:
- Healthy Planet Canada is a health and wellness retailer
- We sell supplements, vitamins, natural health products, organic foods, and wellness items
- We have multiple store locations across Canada
- We offer both in-store and online shopping
- We focus on natural, organic, health-conscious products, organic fresh produce, organic dairy and eggs

RESPONSE STYLE:
- Keep responses concise and helpful like a knowledgeable store employee
- Don't ask users to wait or say you'll get back to them
- If you don't know something specific, admit it and direct them to the appropriate resource
- Maintain a friendly, professional tone without constantly identifying yourself`;

// Initialize with system instruction that stays in history
let chatHistory = [
  { role: "user", parts: [{ text: SYSTEM_INSTRUCTION }] },
  { role: "model", parts: [{ text: "Hello! I can help you with our stores, products, supplements, returns, and wellness questions. What are you looking for today?" }] }
];

const MAX_TURNS = 20; // Increased to maintain context better
const trimHistory = () => {
  // Always keep the system instruction (first 2 messages)
  if (chatHistory.length > MAX_TURNS) {
    chatHistory = [
      chatHistory[0], // system instruction
      chatHistory[1], // system response
      ...chatHistory.slice(-(MAX_TURNS - 2))
    ];
  }
};

// ===== Helpers =====
const createMessageElement = (content, ...classes) => {
  const div = document.createElement("div");
  div.classList.add("message", ...classes);
  div.innerHTML = content;
  return div;
};

// Enhanced text cleaning that preserves links
const cleanBotText = (raw = "") =>
  raw
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ""))
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.*?)__/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/_(.*?)_/g, "<em>$1</em>")
    .replace(/~~(.*?)~~/g, "<del>$1</del>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

// Convert markdown links to HTML
const processLinks = (text) => {
  return text.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
};

// Enhanced response processing with better link integration - FINAL VERSION
const enhanceResponse = (text, userQuery) => {
  let enhanced = text;
  
  // Debug logging
  console.log('Original text:', text);
  console.log('User query:', userQuery);
  
  // FIRST: Replace any raw URLs with "click here" links
  // Replace store locator URL
  enhanced = enhanced.replace(
    new RegExp(STORE_LOCATOR_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
    `<a href="${STORE_LOCATOR_URL}" target="_blank" rel="noopener noreferrer">click here</a>`
  );
  
  // Replace return policy URL
  enhanced = enhanced.replace(
    new RegExp(RETURN_POLICY_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
    `<a href="${RETURN_POLICY_URL}" target="_blank" rel="noopener noreferrer">click here</a>`
  );
  
  // SECOND: Add contextual links if they don't exist
  // Check if user asked about store info and response doesn't already have store locator
  if (isStoreRelated(userQuery) && !enhanced.includes(STORE_LOCATOR_URL) && !enhanced.includes('store locator')) {
    console.log('Adding store locator link');
    enhanced += ` You can find store details <a href="${STORE_LOCATOR_URL}" target="_blank" rel="noopener noreferrer">here</a>.`;
  }
  
  // Check if user asked about returns and response doesn't already have return policy
  if (isReturnRelated(userQuery) && !enhanced.includes(RETURN_POLICY_URL) && !enhanced.includes('return policy')) {
    console.log('Adding return policy link');
    enhanced += ` Check our return policy <a href="${RETURN_POLICY_URL}" target="_blank" rel="noopener noreferrer">here</a> for complete details.`;
  }
  
  console.log('Enhanced text:', enhanced);
  return enhanced;
};

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1]);
  r.onerror = reject;
  r.readAsDataURL(file);
});

const createImagePreview = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement('img');
      img.src = e.target.result;
      img.style.cssText = 'width: 60px; height: 60px; object-fit: cover; border-radius: 8px; border: 2px solid #e5e7eb;';
      img.alt = file.name;
      resolve(img);
    };
    reader.readAsDataURL(file);
  });
};

const addFiles = async (fileList) => {
  const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
  for (const file of files) {
    if (file.size > MAX_SIZE_MB * 1024 * 1024) { 
      alert(`${file.name} is larger than ${MAX_SIZE_MB} MB`); 
      continue; 
    }
    const b64 = await fileToBase64(file);
    const preview = await createImagePreview(file);
    selectedImages.push({ file, b64, preview });
  }
  
  // Show thumbnails when files are selected
  if (selectedImages.length) {
    formEl.classList.add("has-attachments");
    updateImageThumbnails();
  }
};

const updateImageThumbnails = () => {
  // Remove existing thumbnails
  const existingThumbnails = formEl.querySelector('.image-thumbnails');
  if (existingThumbnails) {
    existingThumbnails.remove();
  }
  
  if (selectedImages.length > 0) {
    const thumbnailContainer = document.createElement('div');
    thumbnailContainer.className = 'image-thumbnails';
    thumbnailContainer.style.cssText = 'display: flex; gap: 8px; padding: 8px; flex-wrap: wrap; background: #f8f9fa; border-radius: 8px; margin-bottom: 8px;';
    
    selectedImages.forEach((imgData, index) => {
      const thumbnailWrapper = document.createElement('div');
      thumbnailWrapper.style.cssText = 'position: relative;';
      
      const thumbnail = imgData.preview.cloneNode();
      thumbnail.src = imgData.preview.src;
      thumbnail.style.cssText = imgData.preview.style.cssText;
      
      // Add remove button
      const removeBtn = document.createElement('button');
      removeBtn.innerHTML = '×';
      removeBtn.style.cssText = 'position: absolute; top: -5px; right: -5px; width: 20px; height: 20px; border: none; border-radius: 50%; background: #ef4444; color: white; cursor: pointer; font-size: 14px; line-height: 1;';
      removeBtn.onclick = (e) => {
        e.preventDefault();
        selectedImages.splice(index, 1);
        if (selectedImages.length === 0) {
          formEl.classList.remove("has-attachments");
        }
        updateImageThumbnails();
      };
      
      thumbnailWrapper.appendChild(thumbnail);
      thumbnailWrapper.appendChild(removeBtn);
      thumbnailContainer.appendChild(thumbnailWrapper);
    });
    
    // Insert before the input area
    const chatForm = document.querySelector('.chat-form');
    const inputArea = chatForm.querySelector('.message-input') || chatForm.querySelector('input');
    if (inputArea && inputArea.parentNode) {
      inputArea.parentNode.insertBefore(thumbnailContainer, inputArea);
    } else {
      chatForm.insertBefore(thumbnailContainer, chatForm.firstChild);
    }
  }
};

function insertAtCursor(el, text){
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0,start) + text + el.value.slice(end);
  const pos = start + text.length;
  el.setSelectionRange(pos, pos);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// ===== Typing animation =====
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
    "Hey there 👋😊\nI can help you with Healthy Planet Canada stores, products, supplements, returns, and more.\nWhat are you looking for today?",
    14
  );
  
  // Ensure bubble is hidden since chat is open by default
  bubble.hidden = true;
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

      document.addEventListener('click', (ev) => {
        if (pickerOpen && !emojiPicker.contains(ev.target) && ev.target !== emojiBtn) {
          emojiPicker.remove();
          pickerOpen = false;
        }
      });
    })
    .catch(err => {
      console.warn("Emoji picker failed to load:", err);
      if (emojiBtn) emojiBtn.style.display = 'none';
    });
}

// Detect store/return related queries
const isStoreRelated = (text) => {
  const storeKeywords = /\b(store|location|branch|shop|near|address|directions|hours?|open|close|phone|contact|where|find)\b/i;
  return storeKeywords.test(text);
};

const isReturnRelated = (text) => {
  const returnKeywords = /\b(return|refund|exchange|policy|bring back|take back|money back|warranty)\b/i;
  return returnKeywords.test(text);
};

// ===== Gemini call =====
const generateBotResponse = async (incomingMessageDiv) => {
  const messageElement = incomingMessageDiv.querySelector(".message-text");

  try {
    const requestOptions = {
      method: "POST",
      headers: { 
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
        contents: chatHistory,
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
      let errorMessage = "⚠️ I'm having trouble connecting right now. Please try again in a moment.";
      
      if (data?.error?.message) {
        const errorMsg = data.error.message.toLowerCase();
        if (errorMsg.includes('api key') || errorMsg.includes('authentication')) {
          errorMessage = "⚠️ Authentication issue. Please contact our technical support.";
        } else if (errorMsg.includes('quota') || errorMsg.includes('limit')) {
          errorMessage = "⚠️ Service temporarily busy. Please try again in a few minutes.";
        } else if (errorMsg.includes('model') || errorMsg.includes('not found')) {
          errorMessage = "⚠️ Service temporarily unavailable. Please contact our support team.";
        } else if (errorMsg.includes('blocked') || errorMsg.includes('safety')) {
          errorMessage = "⚠️ I couldn't process that request. Please rephrase your question about Healthy Planet Canada.";
        }
      }
      
      throw new Error(errorMessage);
    }

    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) {
      throw new Error("⚠️ I didn't receive a proper response. Please try asking again.");
    }

    let apiResponseText = cleanBotText(raw);
    
    // Process markdown links first
    apiResponseText = processLinks(apiResponseText);
    
    // Get user query for context
    const lastUserMessage = chatHistory[chatHistory.length - 1];
    const userText = lastUserMessage?.parts?.find(part => part.text)?.text || '';
    
    // Enhance response with contextually appropriate links
    apiResponseText = enhanceResponse(apiResponseText, userText);

    // Debug: Log the final response before rendering
    console.log('Final API response text:', apiResponseText);
    
    // Type as plain text first, then replace with HTML
    const plainText = apiResponseText.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    await typeInto(messageElement, plainText, 16);
    
    // Now set the HTML content with proper formatting
    const finalHTML = apiResponseText.replace(/\n/g, '<br>');
    console.log('Setting innerHTML to:', finalHTML);
    messageElement.innerHTML = finalHTML;

    // Add to history
    chatHistory.push({ role: "model", parts: [{ text: raw }] }); // Store original response
    trimHistory();

  } catch (err) {
    console.error("❌ API Error:", err);
    messageElement.innerHTML = err.message || "⚠️ I'm having trouble right now. Please try again later, or visit our <a href='https://www.healthyplanetcanada.com' target='_blank'>website</a> for immediate assistance.";
  } finally {
    selectedImages = [];
    formEl.classList.remove("has-attachments");
    updateImageThumbnails(); // Clear thumbnails
    incomingMessageDiv.classList.remove("thinking");
    chatBody.scrollTop = chatBody.scrollHeight;
  }
};

// ===== Send flow =====
const handleOutgoingMessage = (e) => {
  e.preventDefault();
  userData.message = messageInput.value.trim();

  openChat();

  if (!userData.message && selectedImages.length === 0) return;

  // User bubble
  const messageContent = `<div class="message-text"></div>`;
  const outgoingMessageDiv = createMessageElement(messageContent, "user-message");
  outgoingMessageDiv.querySelector(".message-text").textContent =
    userData.message || "(sent image)";
  chatBody.appendChild(outgoingMessageDiv);

  // Image previews in message
  if (selectedImages.length) {
    const imgWrap = document.createElement("div");
    imgWrap.className = "image-preview-wrap";
    imgWrap.style.cssText = "display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;";
    
    selectedImages.forEach(({ file }) => {
      const url = URL.createObjectURL(file);
      const img = document.createElement("img");
      img.style.cssText = "width: 120px; height: 120px; object-fit: cover; border-radius: 12px; border: 1px solid #e5e7eb;";
      img.src = url; 
      img.alt = file.name;
      imgWrap.appendChild(img);
    });
    outgoingMessageDiv.appendChild(imgWrap);
  }

  // Build user message parts
  const userParts = [];
  
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
  
  if (userData.message) {
    userParts.push({ text: userData.message });
  }

  // Add to history
  chatHistory.push({ role: "user", parts: userParts });
  trimHistory();

  // Reset input
  messageInput.value = "";
  chatBody.scrollTop = chatBody.scrollHeight;

  // Thinking bubble
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
