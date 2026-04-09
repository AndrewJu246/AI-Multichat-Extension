// ==========================================
// SHARED: Type text into input box and click send
// Extracted from original Action 1 — logic is identical
// ==========================================
function typeTextAndSend(text) {
    let hostname = window.location.hostname;
    let inputBox = null;
    let sendButton = null;

    // 1. Find the input box
    if (hostname.includes("chatgpt.com")) inputBox = document.querySelector('#prompt-textarea');
    else if (hostname.includes("claude.ai")) inputBox = document.querySelector('div[contenteditable="true"]');
    else if (hostname.includes("deepseek.com")) inputBox = document.querySelector('textarea[placeholder="Message DeepSeek"]');
    else if (hostname.includes("gemini.google.com")) {
        inputBox = document.querySelector('.ql-editor[contenteditable="true"]')
                || document.querySelector('rich-textarea div[contenteditable="true"]')
                || document.querySelector('.text-input-field');
    }

    if (inputBox) {
        inputBox.focus();

        if (hostname.includes("gemini.google.com")) {
            // GEMINI: Quill editor needs a real clipboard paste.
            // Write to clipboard, then simulate Ctrl+V.
            navigator.clipboard.writeText(text).then(() => {
                console.log("✅ Wrote to clipboard, simulating Ctrl+V");
                document.execCommand('paste');
                
                // Give Quill a moment to process the paste
                setTimeout(() => {
                    // Check if text landed
                    let hasText = inputBox.innerText && inputBox.innerText.trim().length > 0;
                    console.log("Gemini text landed:", hasText);

                    // Click send
                    setTimeout(() => {
                        sendButton = document.querySelector('.send-button, button[aria-label="Send message"]');
                        if (sendButton && !sendButton.disabled) {
                            sendButton.click();
                            console.log("✅ Gemini send clicked");
                        } else {
                            // Enter key fallback
                            inputBox.dispatchEvent(new KeyboardEvent('keydown', {
                                key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true
                            }));
                            console.log("Gemini: used Enter key fallback");
                        }
                    }, 500);
                }, 300);
            }).catch(err => {
                console.warn("Clipboard write failed:", err, "— trying execCommand fallback");
                // Fallback: try execCommand insertText anyway
                document.execCommand('insertText', false, text);
                inputBox.dispatchEvent(new Event('input', { bubbles: true }));
                
                setTimeout(() => {
                    sendButton = document.querySelector('.send-button, button[aria-label="Send message"]');
                    if (sendButton && !sendButton.disabled) sendButton.click();
                }, 1000);
            });

        } else {
            // ALL OTHER SITES: original paste trick (unchanged)
            let pasted = document.execCommand('insertText', false, text);

            if (!pasted) {
                if (inputBox.tagName === "TEXTAREA" || inputBox.tagName === "INPUT") {
                    let nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
                    nativeSetter.call(inputBox, text);
                } else {
                    inputBox.innerText = text;
                }
                inputBox.dispatchEvent(new Event('input', { bubbles: true }));
                inputBox.dispatchEvent(new Event('change', { bubbles: true }));
            }
            
            setTimeout(() => {
                if (hostname.includes("chatgpt.com")) {
                    sendButton = document.querySelector('button[data-testid="send-button"]');
                } else if (hostname.includes("claude.ai")) {
                    sendButton = document.querySelector('button[aria-label="Send message"]');
                }
                
                if (sendButton && !sendButton.disabled) {
                    sendButton.click();
                } else if (hostname.includes("deepseek.com") || hostname.includes("chatgpt.com")) {
                    inputBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                }
            }, 1000);
        }
    } else {
        console.error("❌ Could not find the input box on " + hostname);
    }
}


// ==========================================
// SHARED: File upload helpers
// ==========================================

// Convert base64 string back to a File object
function base64ToFile(b64Data, fileName, mimeType) {
    let byteString = atob(b64Data);
    let ab = new ArrayBuffer(byteString.length);
    let ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new File([ab], fileName, { type: mimeType || 'application/octet-stream' });
}

// Inject File objects into an <input type="file"> element
function injectFilesIntoInput(inputEl, files) {
    let dt = new DataTransfer();
    files.forEach(f => dt.items.add(f));
    inputEl.files = dt.files;
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    console.log(`✅ Injected ${files.length} file(s) into <input>`);
}

// Simulate a drag-and-drop onto a target element (fallback strategy)
function simulateFileDrop(target, files) {
    let dt = new DataTransfer();
    files.forEach(f => dt.items.add(f));
    target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('dragover',  { bubbles: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('drop',      { bubbles: true, dataTransfer: dt }));
    console.log(`✅ Simulated drag-and-drop of ${files.length} file(s)`);
}

// Simulate a paste event with files (for Quill editors like Gemini)
function simulateFilePaste(target, files) {
    let dt = new DataTransfer();
    files.forEach(f => dt.items.add(f));
    
    // Try ClipboardEvent paste
    try {
        let pasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dt
        });
        target.dispatchEvent(pasteEvent);
        console.log(`✅ Simulated paste of ${files.length} file(s) via ClipboardEvent`);
    } catch (err) {
        console.warn("ClipboardEvent paste failed:", err);
    }
    
    // Also try InputEvent with dataTransfer (some editors listen for this)
    try {
        let inputEvent = new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertFromPaste',
            dataTransfer: dt
        });
        target.dispatchEvent(inputEvent);
        console.log(`✅ Simulated beforeinput paste of ${files.length} file(s)`);
    } catch (err) {
        console.warn("InputEvent paste failed:", err);
    }
}

// Small async delay helper
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// DeepSeek: dedicated post-upload text input + send
// React re-renders the textarea after file upload, so we must:
// 1. Re-query for the textarea with broad selectors
// 2. Force native value setter (execCommand won't work on re-rendered React input)
// 3. Click the actual send button (Enter key unreliable after upload)
async function typeTextDeepSeekPostUpload(text) {
    // Broad selector: try multiple possible selectors since placeholder may change
    let textarea = document.querySelector('textarea[placeholder="Message DeepSeek"]')
                || document.querySelector('textarea#chat-input')
                || document.querySelector('div[class*="chat-input"] textarea')
                || document.querySelector('textarea');

    if (!textarea) {
        console.error("❌ DeepSeek: could not find textarea after file upload");
        return;
    }

    console.log("DeepSeek post-upload: found textarea, setting value via native setter...");
    textarea.focus();
    await wait(200);

    // Force native setter — this bypasses React's controlled input
    let nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    nativeSetter.call(textarea, text);

    // Dispatch React-compatible events to update internal state
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    // React 16+ uses these synthetic event internals
    textarea.dispatchEvent(new Event('compositionend', { bubbles: true }));

    console.log("DeepSeek post-upload: text set, value length =", textarea.value.length);

    // Wait for React to process and enable the send button
    await wait(1500);

    // Try to find and click the send button directly
    let sendBtn = document.querySelector('div[class*="chat-input"] button[class*="send"]')
               || document.querySelector('button[class*="send"]')
               || document.querySelector('div[class*="chat-input-actions"] button');

    // Broader scan: find buttons near the textarea
    if (!sendBtn) {
        let allBtns = document.querySelectorAll('button');
        for (let btn of allBtns) {
            let ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
            let svg = btn.querySelector('svg');
            // DeepSeek send button typically has an SVG icon and is near the input
            if (ariaLabel.includes('send') || (svg && btn.closest('[class*="chat-input"]'))) {
                // Check it's not disabled
                if (!btn.disabled && !btn.classList.contains('disabled')) {
                    sendBtn = btn;
                    break;
                }
            }
        }
    }

    if (sendBtn && !sendBtn.disabled) {
        console.log("DeepSeek post-upload: clicking send button");
        sendBtn.click();
    } else {
        // Fallback: try Enter key on the textarea
        console.log("DeepSeek post-upload: no send button found, trying Enter key...");
        textarea.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
        }));
        await wait(300);
        textarea.dispatchEvent(new KeyboardEvent('keyup', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
        }));
    }
}

// Gemini: dedicated post-upload text input + send
// The tab may not be focused (popup stole focus), so we must:
// 1. Focus the window and the input element
// 2. Use execCommand insertText (needs focus)
// 3. Fall back to Quill Delta manipulation if needed
async function typeTextGeminiPostUpload(text) {
    let inputBox = document.querySelector('.ql-editor[contenteditable="true"]')
                || document.querySelector('rich-textarea div[contenteditable="true"]')
                || document.querySelector('.text-input-field');

    if (!inputBox) {
        console.error("❌ Gemini: could not find input box after file upload");
        return;
    }

    // CRITICAL: Focus the window first — clipboard and execCommand need this
    console.log("Gemini post-upload: focusing window and input...");
    window.focus();
    await wait(300);
    inputBox.click();
    await wait(200);
    inputBox.focus();
    await wait(300);

    // Attempt 1: execCommand insertText (works when document is focused)
    let inserted = document.execCommand('insertText', false, text);
    console.log("Gemini post-upload: execCommand insertText result:", inserted);
    
    await wait(500);
    let hasText = inputBox.innerText && inputBox.innerText.trim().length > 0;
    console.log("Gemini post-upload: text landed after insertText:", hasText);

    // Attempt 2: If insertText failed, try clipboard
    if (!hasText) {
        try {
            await navigator.clipboard.writeText(text);
            document.execCommand('paste');
            console.log("Gemini post-upload: tried clipboard paste");
            await wait(500);
            hasText = inputBox.innerText && inputBox.innerText.trim().length > 0;
        } catch (err) {
            console.warn("Gemini post-upload: clipboard paste failed:", err);
        }
    }

    // Attempt 3: Direct Quill-compatible manipulation
    if (!hasText) {
        console.log("Gemini post-upload: trying direct Quill manipulation...");
        // Clear existing content and insert a text node
        inputBox.innerHTML = '';
        let p = document.createElement('p');
        p.textContent = text;
        inputBox.appendChild(p);
        
        // Dispatch events that Quill listens to
        inputBox.dispatchEvent(new Event('input', { bubbles: true }));
        inputBox.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'insertText',
            data: text
        }));
        await wait(500);
        
        hasText = inputBox.innerText && inputBox.innerText.trim().length > 0;
        console.log("Gemini post-upload: text landed after Quill manipulation:", hasText);
    }

    // Click send
    await wait(500);
    let sendButton = document.querySelector('.send-button, button[aria-label="Send message"]');
    if (sendButton && !sendButton.disabled) {
        sendButton.click();
        console.log("✅ Gemini post-upload: send clicked");
    } else {
        inputBox.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true
        }));
        console.log("Gemini post-upload: used Enter key fallback");
    }
}


// Search for file input in shadow DOMs (some sites nest it there)
function findFileInputInShadows(root) {
    let input = root.querySelector('input[type="file"]');
    if (input) return input;
    
    let allEls = root.querySelectorAll('*');
    for (let el of allEls) {
        if (el.shadowRoot) {
            let found = findFileInputInShadows(el.shadowRoot);
            if (found) return found;
        }
    }
    return null;
}

// Poll for a file input to appear in the DOM (after button clicks)
async function waitForFileInput(maxMs = 3000) {
    let start = Date.now();
    while (Date.now() - start < maxMs) {
        let input = document.querySelector('input[type="file"]') || findFileInputInShadows(document);
        if (input) return input;
        await wait(200);
    }
    return null;
}

// Poll for send button to become enabled (DeepSeek file processing)
async function waitForSendReady(hostname, maxMs = 15000) {
    let start = Date.now();
    while (Date.now() - start < maxMs) {
        let btn = null;
        if (hostname.includes("deepseek.com")) {
            btn = document.querySelector('div[class*="chat-input"] button:not([disabled])')
               || document.querySelector('button[class*="send"]:not([disabled])');
            // Also check if any "processing" / "uploading" indicator is gone
            let uploading = document.querySelector('[class*="uploading"], [class*="loading"], [class*="progress"]');
            if (btn && !uploading) {
                console.log("✅ DeepSeek send ready after " + (Date.now() - start) + "ms");
                return true;
            }
        } else {
            return true; // other sites don't need polling
        }
        await wait(500);
    }
    console.warn("⚠️ Timed out waiting for send to be ready");
    return false;
}

// Find and prepare the file input for a given site
// Returns the <input type="file"> element, or null
async function findFileInput(hostname) {
    // Strategy 1: Direct lookup — many sites have a hidden file input already in DOM
    let fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
        console.log("Found file input directly in DOM");
        return fileInput;
    }

    // Strategy 1b: Check shadow DOMs
    fileInput = findFileInputInShadows(document);
    if (fileInput) {
        console.log("Found file input in shadow DOM");
        return fileInput;
    }

    // Strategy 2: Click the attachment/upload button to reveal the file input
    if (hostname.includes("chatgpt.com")) {
        let attachBtn = document.querySelector('button[aria-label="Attach files"]')
                     || document.querySelector('button[aria-label="Upload file"]')
                     || document.querySelector('button[data-testid="upload-button"]');
        if (attachBtn) {
            console.log("ChatGPT: clicking attachment button...");
            attachBtn.click();
            return await waitForFileInput();
        }

    } else if (hostname.includes("claude.ai")) {
        let attachBtn = document.querySelector('button[aria-label="Attach files"]')
                     || document.querySelector('button[aria-label="Upload files"]')
                     || document.querySelector('button[data-testid="file-upload"]');
        if (attachBtn) {
            console.log("Claude: clicking attachment button...");
            attachBtn.click();
            return await waitForFileInput();
        }

    } else if (hostname.includes("deepseek.com")) {
        let attachBtn = document.querySelector('div[class*="upload"] button')
                     || document.querySelector('button[class*="upload"]')
                     || document.querySelector('div.ds-icon-button');
        if (attachBtn) {
            console.log("DeepSeek: clicking attachment button...");
            attachBtn.click();
            return await waitForFileInput();
        }

    } else if (hostname.includes("gemini.google.com")) {
        // Gemini does NOT use <input type="file"> — it uses the File System Access API
        // (showOpenFilePicker). There is no file input element to find or inject into.
        // We return null here and handle Gemini via paste/drop in the uploadAndSend handler.
        console.log("Gemini: no standard file input available (uses File System Access API)");
        return null;
    }

    console.warn("⚠️ Could not find file input on " + hostname);
    return null;
}


// ==========================================
// MESSAGE LISTENER
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    // ==========================================
    // ACTION 1: TYPE AND SEND (original, calls shared function)
    // ==========================================
    if (request.action === "typeAndSend") {
        typeTextAndSend(request.text);
    }

    // ==========================================
    // ACTION 2: SCRAPE AND READ (completely unchanged)
    // ==========================================
    if (request.action === "scrapeLastMessage") {
        let hostname = window.location.hostname;
        let extractedText = "";

        try {
            if (hostname.includes("chatgpt.com")) {
                let bubbles = document.querySelectorAll('[data-message-author-role="assistant"]');
                console.log("ChatGPT bubbles found:", bubbles.length);
                
                if (bubbles.length > 0) {
                    let lastBubble = bubbles[bubbles.length - 1];
                    let innerTextEl = lastBubble.querySelector('.markdown, .prose, [class*="markdown"]');
                    extractedText = innerTextEl ? innerTextEl.innerText : lastBubble.innerText || lastBubble.textContent;
                }
                
            } else if (hostname.includes("claude.ai")) {
                let paras = document.querySelectorAll('.font-claude-response-body'); 
                if (paras.length > 0) {
                    let lastPara = paras[paras.length - 1];
                    extractedText = lastPara.parentElement.innerText; 
                }
                
            } else if (hostname.includes("deepseek.com")) {
                let bubbles = document.querySelectorAll('.ds-markdown');
                if (bubbles.length > 0) extractedText = bubbles[bubbles.length - 1].innerText;
                
            } else if (hostname.includes("gemini.google.com")) {
                let msgContent = document.querySelectorAll('message-content');
                console.log("Gemini message-content found:", msgContent.length);
                
                if (msgContent.length > 0) {
                    extractedText = msgContent[msgContent.length - 1].innerText || msgContent[msgContent.length - 1].textContent;
                }

                if (!extractedText) {
                    let modelResp = document.querySelectorAll('model-response');
                    console.log("Gemini model-response found:", modelResp.length);
                    if (modelResp.length > 0) {
                        extractedText = modelResp[modelResp.length - 1].innerText || modelResp[modelResp.length - 1].textContent;
                    }
                }
            }

            extractedText = extractedText ? extractedText.trim() : "";
            
            if (!extractedText) {
                console.warn(`⚠️ Warning: Found bubbles on ${hostname}, but text was empty.`);
            } else {
                console.log(`✅ Scraped successfully from ${hostname} (${extractedText.length} chars)`);
            }
            
            sendResponse({ text: extractedText });

        } catch (error) {
            console.error("❌ Scraping error on " + hostname + ":", error);
            sendResponse({ text: "" });
        }

        return true;
    }

    // ==========================================
    // ACTION 3: UPLOAD FILES AND SEND (new)
    // ==========================================
    if (request.action === "uploadAndSend") {
        let hostname = window.location.hostname;

        chrome.storage.local.get(request.storageKey, async (data) => {
            let fileDataArray = data[request.storageKey];

            // If no files in storage, fall back to text-only
            if (!fileDataArray || fileDataArray.length === 0) {
                console.warn("⚠️ No files found in storage, sending text only");
                if (request.text) typeTextAndSend(request.text);
                return;
            }

            // Reconstruct File objects from base64
            let files = fileDataArray.map(fd => base64ToFile(fd.base64, fd.name, fd.type));
            console.log(`📎 Reconstructed ${files.length} file(s) for ${hostname}`);

            // ------ STRATEGY A: Find <input type="file"> and inject ------
            let fileInput = await findFileInput(hostname);

            if (fileInput) {
                injectFilesIntoInput(fileInput, files);
            } else if (hostname.includes("gemini.google.com")) {
                // ------ GEMINI-SPECIFIC: Try paste then drop on the editor ------
                console.log("Gemini: trying paste + drop on editor (no file input available)...");
                
                let editor = document.querySelector('.ql-editor[contenteditable="true"]')
                          || document.querySelector('rich-textarea div[contenteditable="true"]')
                          || document.querySelector('.text-input-field');
                
                if (editor) {
                    // Focus the window and editor first
                    window.focus();
                    await wait(200);
                    editor.click();
                    editor.focus();
                    await wait(300);
                    
                    // Strategy 1: Paste event (Quill editors often handle paste with files)
                    console.log("Gemini: trying paste event on editor...");
                    simulateFilePaste(editor, files);
                    await wait(1000);
                    
                    // Strategy 2: Drop event on the editor element specifically
                    console.log("Gemini: trying drop event on editor...");
                    simulateFileDrop(editor, files);
                    await wait(1000);
                    
                    // Strategy 3: Drop on the input container (parent of editor)
                    let inputContainer = editor.closest('rich-textarea') 
                                      || editor.closest('.input-area-container')
                                      || editor.parentElement;
                    if (inputContainer && inputContainer !== editor) {
                        console.log("Gemini: trying drop on input container...");
                        simulateFileDrop(inputContainer, files);
                    }
                } else {
                    // Last resort: drop on body
                    console.log("Gemini: no editor found, dropping on body...");
                    simulateFileDrop(document.body, files);
                }
                
                console.log("⚠️ Gemini file upload is limited — if files didn't attach, Gemini may require manual upload");
            } else {
                // ------ STRATEGY B: Generic drag-and-drop fallback ------
                console.log("Trying drag-and-drop fallback...");
                let dropTarget = null;

                if (hostname.includes("chatgpt.com")) {
                    dropTarget = document.querySelector('main') || document.body;
                } else if (hostname.includes("claude.ai")) {
                    dropTarget = document.querySelector('div[contenteditable="true"]')
                              || document.querySelector('main')
                              || document.body;
                } else if (hostname.includes("deepseek.com")) {
                    dropTarget = document.querySelector('#chat-input')
                              || document.querySelector('main')
                              || document.body;
                } else {
                    dropTarget = document.querySelector('main') || document.body;
                }

                if (dropTarget) {
                    simulateFileDrop(dropTarget, files);
                } else {
                    console.error("❌ Could not find any upload target on " + hostname);
                }
            }

            // Wait for the site to process the upload, then type the prompt
            // DeepSeek needs extra time — poll until files are processed
            if (hostname.includes("deepseek.com")) {
                console.log("DeepSeek: waiting for file processing to finish...");
                await wait(3000); // initial wait for upload to register
                await waitForSendReady(hostname, 15000); // poll up to 15s
            } else if (hostname.includes("gemini.google.com")) {
                console.log("Gemini: waiting for file upload processing...");
                await wait(4000); // Gemini can be slow with upload processing
            } else {
                await wait(2500); // ChatGPT, Claude — works fine with standard delay
            }

            if (request.text) {
                console.log("Typing prompt text after file upload...");

                if (hostname.includes("deepseek.com")) {
                    // DeepSeek: React re-renders the textarea after file upload,
                    // so we must re-find it and use the native value setter.
                    await typeTextDeepSeekPostUpload(request.text);
                } else if (hostname.includes("gemini.google.com")) {
                    // Gemini: re-focus the editor and use clipboard approach
                    await typeTextGeminiPostUpload(request.text);
                } else {
                    typeTextAndSend(request.text);
                }
            }
        });

        return true; // keep message channel open for async
    }
});n