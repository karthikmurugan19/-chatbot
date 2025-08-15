const chatbotToggle = document.getElementById("chatbot-toggle");
const chatbotPopup = document.getElementById("chatbot-popup");
const closeChatbotBtn = document.getElementById("close-chatbot");
const chatBody = document.querySelector(".chat-body");
const messageInput = document.querySelector(".message-input");
const sendMessageButton = document.getElementById("send-message");

const API_KEY = "YOUR_API_KEY_HERE";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

let ongoingContext = [
  {
    role: "system",
    parts: [{ text: "You are a helpful assistant for Healthy Planet. Keep responses consistent, friendly, and relevant." }]
  }
];

const createMessageElement = (content, type = "user", isThinking = false) => {
  const messageDiv = document.createElement("div");
  messageDiv.classList.add("message", `${type}-message`);
  if (isThinking) messageDiv.classList.add("thinking");

  const avatar = document.createElement("div");
  avatar.className = type === "user" ? "user-avatar" : "bot-avatar";
  avatar.textContent = type === "user" ? "🧑" : "🤖";

  const messageText = document.createElement("div");
  messageText.className = "message-text";
  messageText.innerHTML = content;

  messageDiv.appendChild(avatar);
  messageDiv.appendChild(messageText);
  chatBody.appendChild(messageDiv);
  chatBody.scrollTop = chatBody.scrollHeight;
  return messageDiv;
};

const handleBotReply = async (userMessage) => {
  const thinkingDiv = createMessageElement('<span class="dot">●</span><span class="dot">●</span><span class="dot">●</span>', "bot", true);

  try {
    ongoingContext.push({ role: "user", parts: [{ text: userMessage }] });

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: ongoingContext })
    });

    const data = await res.json();
    const botReply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't understand that.";

    ongoingContext.push({ role: "model", parts: [{ text: botReply }] });

    chatBody.removeChild(thinkingDiv);
    createMessageElement(botReply, "bot");

  } catch (error) {
    chatBody.removeChild(thinkingDiv);
    createMessageElement("Oops! Something went wrong.", "bot");
  }
};

const handleSend = () => {
  const text = messageInput.value.trim();
  if (!text) return;

  createMessageElement(text, "user");
  messageInput.value = "";
  handleBotReply(text);
};

sendMessageButton.addEventListener("click", handleSend);

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

chatbotToggle.addEventListener("click", () => {
  const isOpen = chatbotPopup.classList.contains("open");

  if (!isOpen) {
    chatbotPopup.classList.add("open");
    chatbotToggle.style.display = "none";

    setTimeout(() => {
      createMessageElement("👋 Hello! How can I assist you today?", "bot");
    }, 300);
  }
});

closeChatbotBtn.addEventListener("click", () => {
  chatbotPopup.classList.remove("open");
  chatbotToggle.style.display = "block";
});
