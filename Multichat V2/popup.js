// Helper: Send a message to a tab, auto-injecting the content script if needed
function sendToTab(tabId, message, callback) {
    chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError && chrome.runtime.lastError.message.includes("Receiving end does not exist")) {
            console.log(`⚙️ Content script not found on tab ${tabId}, injecting...`);
            chrome.scripting.executeScript(
                { target: { tabId: tabId }, files: ["content.js"] },
                () => {
                    if (chrome.runtime.lastError) {
                        console.error(`❌ Injection failed on tab ${tabId}:`, chrome.runtime.lastError.message);
                        if (callback) callback(null);
                        return;
                    }
                    // Retry the message after injection
                    console.log(`✅ Injected content script, retrying message on tab ${tabId}`);
                    chrome.tabs.sendMessage(tabId, message, (retryResponse) => {
                        if (chrome.runtime.lastError) {
                            console.error(`❌ Retry failed on tab ${tabId}:`, chrome.runtime.lastError.message);
                            if (callback) callback(null);
                            return;
                        }
                        if (callback) callback(retryResponse);
                    });
                }
            );
        } else {
            if (callback) callback(response);
        }
    });
}


// ==========================================
// FILE PICKER UI
// ==========================================
const fileInput = document.getElementById('fileInput');
const fileCount = document.getElementById('fileCount');
const clearFiles = document.getElementById('clearFiles');
const fileList = document.getElementById('fileList');
const statusEl = document.getElementById('status');

fileInput.addEventListener('change', () => {
    let files = fileInput.files;
    if (files.length > 10) {
        alert("Max 10 files allowed. Please select fewer files.");
        fileInput.value = '';
        updateFileDisplay();
        return;
    }
    updateFileDisplay();
});

clearFiles.addEventListener('click', (e) => {
    e.preventDefault();
    fileInput.value = '';
    updateFileDisplay();
});

function updateFileDisplay() {
    let files = fileInput.files;
    if (files.length === 0) {
        fileCount.textContent = '';
        clearFiles.style.display = 'none';
        fileList.innerHTML = '';
    } else {
        fileCount.textContent = `${files.length} file${files.length > 1 ? 's' : ''}`;
        clearFiles.style.display = 'inline';
        let names = Array.from(files).map(f => {
            let sizeKB = (f.size / 1024).toFixed(1);
            return `${f.name} (${sizeKB} KB)`;
        });
        fileList.innerHTML = names.map(n => `<div>• ${n}</div>`).join('');
    }
}

function setStatus(msg) {
    statusEl.textContent = msg;
    setTimeout(() => { statusEl.textContent = ''; }, 5000);
}

// Helper: Read a File as base64 string
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        let reader = new FileReader();
        reader.onload = () => {
            // result is "data:<type>;base64,XXXX" — strip prefix
            let base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}


// ==========================================
// BUTTON 1: Send to All (enhanced with file support)
// ==========================================
document.getElementById('sendAll').addEventListener('click', async () => {
    let promptText = document.getElementById('myPrompt').value;
    let selectedFiles = fileInput.files;
    let tabs = await chrome.tabs.query({});

    let aiTabs = tabs.filter(tab => 
        tab.url && (
            tab.url.includes("chatgpt.com") || tab.url.includes("claude.ai") || 
            tab.url.includes("gemini.google.com") || tab.url.includes("chat.deepseek.com")
        )
    );

    if (aiTabs.length === 0) {
        alert("No AI tabs found! Open at least one AI chat tab.");
        return;
    }

    // If files are selected, use the new uploadAndSend action
    if (selectedFiles.length > 0) {
        setStatus("📦 Preparing files...");

        try {
            // Convert all files to base64
            let fileDataArray = [];
            for (let file of selectedFiles) {
                let base64 = await readFileAsBase64(file);
                fileDataArray.push({
                    name: file.name,
                    type: file.type || 'application/octet-stream',
                    size: file.size,
                    base64: base64
                });
            }

            // Store in chrome.storage.local
            await chrome.storage.local.set({ pendingFiles: fileDataArray });
            console.log(`✅ Stored ${fileDataArray.length} files in chrome.storage.local`);
            setStatus(`📤 Sending ${fileDataArray.length} file(s) + prompt to ${aiTabs.length} tab(s)...`);

            // Send uploadAndSend to each AI tab
            aiTabs.forEach(tab => {
                sendToTab(tab.id, {
                    action: "uploadAndSend",
                    text: promptText,
                    storageKey: "pendingFiles"
                });
            });

            // Clean up storage after 60 seconds (enough time for all tabs)
            setTimeout(() => {
                chrome.storage.local.remove("pendingFiles");
                console.log("🧹 Cleaned up pendingFiles from storage");
            }, 60000);

        } catch (err) {
            console.error("❌ File prep error:", err);
            setStatus("❌ Error preparing files");
        }

    } else {
        // ORIGINAL BEHAVIOR (unchanged): just send text, no files
        aiTabs.forEach(tab => {
            sendToTab(tab.id, { action: "typeAndSend", text: promptText });
        });
        setStatus(`📤 Sent prompt to ${aiTabs.length} tab(s)`);
    }
});


// ==========================================
// BUTTON 2: Swap & Debate (completely unchanged)
// ==========================================
document.getElementById('swapDebate').addEventListener('click', async () => {
    let tabs = await chrome.tabs.query({});
    
    let aiTabs = {
        deepseek: tabs.find(t => t.url.includes("chat.deepseek.com")),
        claude: tabs.find(t => t.url.includes("claude.ai")),
        chatgpt: tabs.find(t => t.url.includes("chatgpt.com")),
        gemini: tabs.find(t => t.url.includes("gemini.google.com"))
    };

    let order = ['deepseek', 'claude', 'chatgpt', 'gemini'];
    let activeRotation = order.filter(model => aiTabs[model] !== undefined);

    console.log("Active rotation:", activeRotation);

    if (activeRotation.length < 2) {
        alert("You need at least two AI tabs open to debate!");
        return;
    }

    for (let i = 0; i < activeRotation.length; i++) {
        
        let currentModel = activeRotation[i];
        let nextModel = activeRotation[(i + 1) % activeRotation.length];
        
        let currentTab = aiTabs[currentModel];
        let nextTab = aiTabs[nextModel];

        console.log(`[${i}] Scraping ${currentModel} (tab ${currentTab.id}) → will send to ${nextModel} (tab ${nextTab.id})`);

        sendToTab(currentTab.id, { action: "scrapeLastMessage" }, (response) => {
            console.log(`📨 Response from ${currentModel}:`, response ? (response.text ? response.text.substring(0, 80) + "..." : "EMPTY text") : "NULL response");

            if (response && response.text) {
                let debatePrompt = `What do you think about this response:\n\n"${response.text}"`;
                
                console.log(`📤 Sending ${debatePrompt.length} chars to ${nextModel} (tab ${nextTab.id})`);
                sendToTab(nextTab.id, { action: "typeAndSend", text: debatePrompt });
            } else {
                console.warn(`⚠️ Nothing scraped from ${currentModel}, skipping send to ${nextModel}`);
            }
        });
    }
});
