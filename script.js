const chatBody = document.querySelector(".chat-body");
const messageInput = document.querySelector(".message-input");
const sendMessageButton = document.querySelector("#send-message");

const API_KEY = "AIzaSyDjWSYA7pDcUiddC3SvhJnxTXBAie1j4WE"; // 🔐 Replace with your actual Gemini API Key
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

const userData = {
  message: null
};

// Helper: Create chat message bubble
const createMessageElement = (content, ...classes) => {
  const div = document.createElement("div");
  div.classList.add("message", ...classes);
  div.innerHTML = content;
  return div;
};

// Generate bot reply (Healthy Planet–restricted)
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
        {
          role: "user",
          parts: [{ text: userData.message }]
        }
      ]
    })
  };

  try {
    const response = await fetch(API_URL, requestOptions);
    const data = await response.json();

    if (!response.ok) throw new Error(data.error.message);

    const apiResponseText = data.candidates[0].content.parts[0].text.trim();
    messageElement.innerText = apiResponseText;
  } catch (error) {
    console.error("❌ API Error:", error);
    messageElement.innerText = "⚠️ Something went wrong. Please try again later.";
  }
};

// Send user message
const handleOutgoingMessage = (e) => {
  e.preventDefault();
  userData.message = messageInput.value.trim();
  if (!userData.message) return;

  // Show user message
  const messageContent = `<div class="message-text"></div>`;
  const outgoingMessageDiv = createMessageElement(messageContent, "user-message");
  outgoingMessageDiv.querySelector(".message-text").textContent = userData.message;
  chatBody.appendChild(outgoingMessageDiv);
  messageInput.value = "";
  chatBody.scrollTop = chatBody.scrollHeight;

  // Show thinking indicator
  const botThinkingContent = `
    <svg class="bot-avatar" width="40" height="40" viewBox="0 0 50 50">
      <!-- You can replace with your own SVG -->
      <circle cx="25" cy="25" r="20" fill="#45B94E"/>
    </svg>
    <div class="message-text">
      <div class="thinking-indicator">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
    </div>
  `;
  const incomingMessageDiv = createMessageElement(botThinkingContent, "bot-message", "thinking");
  chatBody.appendChild(incomingMessageDiv);
  chatBody.scrollTop = chatBody.scrollHeight;

  // Replace with API response
  generateBotResponse(incomingMessageDiv);
};

// Send message on Enter key
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && messageInput.value.trim()) {
    handleOutgoingMessage(e);
  }
});

// Send message on button click
sendMessageButton.addEventListener("click", (e) => handleOutgoingMessage(e));
