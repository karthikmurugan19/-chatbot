const chatBody = document.querySelector(".chat-body");
const messageInput = document.querySelector(".message-input");
const sendMessageButton = document.querySelector("#send-message");

const API_KEY = "AIzaSyDjWSYA7pDcUiddC3SvhJnxTXBAie1j4WE"; // ⚠️ don't expose in prod
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

const userData = { message: null };

// --- utils ---
const createMessageElement = (content, ...classes) => {
  const div = document.createElement("div");
  div.classList.add("message", ...classes);
  div.innerHTML = content;
  return div;
};

const scrollToBottom = () => {
  // run after layout changes settle
  requestAnimationFrame(() => {
    chatBody.scrollTop = chatBody.scrollHeight;
  });
};

// aggressively clean markdown/extra formatting without killing normal text
const cleanBotText = (raw = "") =>
  raw
    // code fences
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, "")) // keep inner text
    // bold/italics/underline/strikethrough
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/~~(.*?)~~/g, "$1")
    // inline code/backticks
    .replace(/`([^`]+)`/g, "$1")
    // markdown links & images -> keep visible text/alt
    .replace(/!\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    // headings / blockquotes / list bullets
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    // table pipes
    .replace(/^\|.*\|$/gm, (line) => line.replace(/\|/g, " ").replace(/-{3,}/g, ""))
    // stray HTML tags (leave angle-bracket words)
    .replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, "")
    // collapse repeats / whitespace
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

// --- bot call ---
const generateBotResponse = async (incomingMessageDiv) => {
  const messageElement = incomingMessageDiv.querySelector(".message-text");

  const requestOptions = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are a helpful assistant for Healthy Planet Canada.
Only respond to questions about Healthy Planet stores, products, supplements, returns, or related services.
If asked anything unrelated, reply with: "I'm here to help with Healthy Planet Canada. Please ask something related to it."`
            }
          ]
        },
        { role: "user", parts: [{ text: userData.message }] }
      ]
    })
  };

  try {
    const response = await fetch(API_URL, requestOptions);
    const data = await response.json();

    if (!response.ok) throw new Error(data?.error?.message || "Request failed");

    const raw =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ??
      "Sorry, I couldn't generate a response.";
    const apiResponseText = cleanBotText(raw);

    messageElement.innerText = apiResponseText;
  } catch (err) {
    console.error("❌ API Error:", err);
    messageElement.innerText = "⚠️ Something went wrong. Please try again later.";
  } finally {
    // remove thinking & snap to bottom
    incomingMessageDiv.classList.remove("thinking");
    scrollToBottom();
  }
};

// --- sending flow ---
const handleOutgoingMessage = (e) => {
  e.preventDefault();
  userData.message = messageInput.value.trim();
  if (!userData.message) return;

  // show user bubble
  const messageContent = `<div class="message-text"></div>`;
  const outgoingMessageDiv = createMessageElement(messageContent, "user-message");
  outgoingMessageDiv.querySelector(".message-text").textContent = userData.message;
  chatBody.appendChild(outgoingMessageDiv);
  messageInput.value = "";
  scrollToBottom();

  // show thinking bubble
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
  const incomingMessageDiv = createMessageElement(
    botThinkingContent,
    "bot-message",
    "thinking"
  );
  chatBody.appendChild(incomingMessageDiv);
  scrollToBottom();

  // call API
  generateBotResponse(incomingMessageDiv);
};

// enter key & button
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && messageInput.value.trim()) handleOutgoingMessage(e);
});
sendMessageButton.addEventListener("click", (e) => handleOutgoingMessage(e));
