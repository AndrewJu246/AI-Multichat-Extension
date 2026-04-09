# AI-Multichat-Extension
A Chrome extension that sends the same prompt to multiple AI chatbots simultaneously and lets them debate each other's responses.

Send to All — Type a prompt once, send it to every open AI tab (ChatGPT, Claude, Gemini, DeepSeek) at the same time. Supports file attachments (up to 10 files).
Swap & Debate — Scrapes the latest response from each AI, then forwards it to the next one in a round-robin with "What do you think about this response?" to start a cross-model debate.

The extension injects a content script into each AI chat tab and manipulates the DOM to type text, upload files, and click send — handling each site's quirks individually (React controlled inputs, Quill editors, shadow DOM file inputs, clipboard-based paste for Gemini, etc.).

Technical Implementation: Building this required reverse-engineering the DOM structures of major AI chatbots to reliably inject text, upload files, and scrape responses.

Install (local)
1. Clone this repo
2. Go to chrome://extensions → enable Developer Mode
3. Click "Load unpacked" → select this folder
4. Open tabs for the AI chats you want to use
5. Click the extension icon to open the popup
