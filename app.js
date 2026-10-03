/* Alibi — a voice murder mystery you question out loud.
 *
 * Four suspects, one night, one killer. Ask the questions from the list, or
 * sign in and ask anything you like out loud. Every suspect answers in
 * character, keeps one thing back until they are pressed, and eventually lets
 * a fact slip that does not fit the rest of their story. Write it down, catch
 * the loose end, name the killer.
 *
 * Offline it runs on the starter case in pack.js and this device's voice.
 * Signed in it writes a new case each time, answers questions that are not on
 * the list, and speaks in a different voice per suspect — on your own Pollen.
 */

const GEN = "https://gen.pollinations.ai";
const ENTER = "https://enter.pollinations.ai";
const APP_URL = location.origin + location.pathname.replace(/index\.html$/, "");

const SS = { token: "al.token", verifier: "al.verifier", state: "al.state" };
const PREF = "al.prefs";
const APPKEY = "al.appkey";

const SCREENS = ["setup", "briefing", "room", "notebook", "accuse", "reveal"];
const PRESSED = 3; // questions it takes before a suspect will say what they were hiding
const SUSPECTS_MIN = 3;
const SUSPECTS_MAX = 5;
const STOP = new Set([
    "the", "and", "you", "your", "for", "are", "not", "her", "his", "him", "from", "into", "out",
    "that", "this", "with", "have", "was", "were", "about", "think", "know", "tell", "say", "said",
    "anything", "something", "please", "just", "really", "there", "when", "what", "were",
]);

const el = {};
const state = {
    mode: "free", // "free" | "key"
    token: "",
    screen: "setup",
    source: "pack",
    voiceMode: "browser",
    case: null,
    suspectIndex: 0,
    asked: {},
    transcript: [],
    slipped: [],
    accusation: "",
    score: { right: 0, wrong: 0 },
    cases: 0,
    aiModel: "",
    voiceModel: "",
    voice: "",
    voiceList: [],
    transcribeModel: "",
    recording: false,
    recorder: null,
    busy: false,
};

/* ------------------------------------------------------------------ plumbing */

function $(id) {
    return document.getElementById(id);
}

let toastTimer = null;

function toast(message, ms = 7000) {
    el.toast.textContent = message;
    el.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add("hidden"), ms);
}

function randomToken(bytes) {
    const buffer = new Uint8Array(bytes);
    crypto.getRandomValues(buffer);
    return btoa(String.fromCharCode(...buffer)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function s256(value) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function authHeaders() {
    return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

async function apiError(response, what) {
    let detail = "";
    try {
        const data = await response.json();
        const raw = data?.error?.message ?? data?.message ?? data?.error;
        detail = typeof raw === "string" ? raw : raw ? JSON.stringify(raw) : "";
    } catch {
        // not JSON; the status is enough
    }
    if (response.status === 401) return `The ${what} call needs a valid Pollinations key. Sign in or paste one.`;
    if (response.status === 402 || response.status === 403) return `The ${what} call was refused${detail ? `: ${detail}` : " — check your Pollen or the key's scope"}.`;
    if (response.status === 429) return "Too many requests just now. Wait a few seconds and try again.";
    return `The ${what} call failed (${response.status})${detail ? `: ${detail}` : ""}.`;
}

/* ------------------------------------------------------------------- the host */

async function chat(model, system, user) {
    const response = await fetch(`${GEN}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
            model: model || "openai",
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
            max_tokens: 2000,
        }),
    });
    if (!response.ok) throw new Error(await apiError(response, "host"));
    const data = await response.json();
    return data?.choices?.[0]?.message?.content ?? "";
}

function cleanJson(text) {
    if (typeof text !== "string") return null;
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
        return JSON.parse(text.slice(start, end + 1));
    } catch {
        return null;
    }
}

/* --------------------------------------------------------------------- cases */

function menu() {
    return window.ALIBI_MENU || [];
}

function menuKeys() {
    return menu().map((item) => item.key);
}

function questionText(key) {
    const item = menu().find((entry) => entry.key === key);
    return item ? item.ask : key;
}

function words(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^a-z\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length >= 3 && !STOP.has(word));
}

function matchQuestion(text) {
    const asked = words(text);
    if (!asked.length) return "";
    let best = "";
    let score = 0;
    for (const item of menu()) {
        const target = new Set(words(`${item.ask} ${item.key}`));
        const hit = asked.filter((word) => target.has(word)).length;
        if (hit > score) {
            score = hit;
            best = item.key;
        }
    }
    return score > 0 ? best : "";
}

function validateCase(data) {
    if (!data || typeof data !== "object") return "no case came back";
    for (const field of ["title", "place", "when", "victim", "brief", "verdict", "solution"]) {
        if (typeof data[field] !== "string" || !data[field].trim()) return `the case has no ${field}`;
    }
    if (!Array.isArray(data.suspects) || data.suspects.length < SUSPECTS_MIN || data.suspects.length > SUSPECTS_MAX) {
        return `a case needs ${SUSPECTS_MIN} to ${SUSPECTS_MAX} suspects`;
    }
    const names = new Set();
    for (const suspect of data.suspects) {
        for (const field of ["name", "role", "look", "voice", "alibi", "secret", "slip"]) {
            if (typeof suspect?.[field] !== "string" || !suspect[field].trim()) return `a suspect has no ${field}`;
        }
        if (names.has(suspect.name)) return `two suspects are called ${suspect.name}`;
        names.add(suspect.name);
        for (const key of menuKeys()) {
            if (typeof suspect.answers?.[key] !== "string" || !suspect.answers[key].trim()) {
                return `${suspect.name} has nothing to say about "${key}"`;
            }
        }
    }
    if (!names.has(data.culprit)) return "the culprit is not one of the suspects";
    return "";
}

function normalizeCase(data) {
    const suspects = (data.suspects || []).map((suspect) => ({
        name: suspect.name,
        role: suspect.role,
        look: suspect.look,
        voice: suspect.voice,
        alibi: suspect.alibi,
        secret: suspect.secret,
        slip: suspect.slip,
        answers: { ...(suspect.answers || {}) },
        deflect: suspect.deflect || "I have answered that. Ask me something else and I will answer it too.",
    }));
    const breaks = {};
    for (const suspect of suspects) {
        breaks[suspect.name] = (data.breaks && data.breaks[suspect.name]) || suspect.slip;
    }
    return {
        id: data.id || "case",
        title: data.title,
        place: data.place,
        when: data.when,
        victim: data.victim,
        brief: data.brief,
        suspects,
        culprit: data.culprit,
        verdict: data.verdict,
        solution: data.solution,
        breaks,
    };
}

function loadPackCase() {
    const pack = window.ALIBI_CASES || [];
    const data = pack.find((entry) => validateCase(entry) === "") || pack[0];
    if (!data) throw new Error("The starter case is missing.");
    state.case = normalizeCase(data);
    state.source = "pack";
}

async function hostCase() {
    const recent = state.case ? `Do not reuse the house, the trade or the culprit from "${state.case.title}".` : "";
    const system = [
        "You write one-night murder mysteries for a parlour game. Reply with JSON only, no commentary, no code fence.",
        'Shape: {"title": string, "place": string, "when": string, "victim": string, "brief": string,',
        ` "suspects": [{"name": string, "role": string, "look": string, "voice": string, "alibi": string, "secret": string, "slip": string, "answers": {${menuKeys().map((key) => `"${key}": string`).join(", ")}}}],`,
        ' "culprit": string, "verdict": string, "solution": string, "breaks": {suspect name: string}}',
        "Rules:",
        `- Exactly ${SUSPECTS_MIN + 1} suspects, each with a name, a role with an age, one line of appearance and a one-line description of their voice.`,
        `- Every suspect answers all of these questions, keyed exactly as shown: ${menuKeys().join(", ")}. One or two sentences each, first person, in character.`,
        '- Every suspect has a "slip": one small fact that contradicts their own alibi or the facts of the case. Never state that it is a contradiction.',
        '- Exactly one culprit, and "culprit" must be one of the suspect names.',
        '- "breaks" has one entry per suspect name, explaining what their slip really means.',
        "- The murder happens on one evening in one house or yard. Period setting, no modern technology, no police procedure, no confession inside the answers.",
        "- Nobody confesses. The culprit lies and stays consistent apart from the slip.",
    ].join("\n");
    const user = [
        `Write case ${state.cases + 1} for tonight. ${recent}`,
        "Vary the trade, the weapon and which suspect is guilty.",
        "Return the JSON object and nothing else.",
    ].join("\n");
    let last = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const text = await chat(state.aiModel, system, attempt ? `${user}\nYour last reply was not valid JSON of that shape. Return the JSON object only.` : user);
        const data = cleanJson(text);
        if (data && validateCase(data) === "") return data;
        last = data ? validateCase(data) : "the host did not return JSON";
    }
    throw new Error(`The host's case did not hold up (${last}).`);
}

/* ---------------------------------------------------------------- the suspect */

function current() {
    return state.case.suspects[state.suspectIndex];
}

function pressedCount(name) {
    return state.transcript.filter((entry) => entry.suspect === name && entry.kind !== "slip").length;
}

function answerFor(suspect, key) {
    if (key === "secret" && pressedCount(suspect.name) < PRESSED) {
        return suspect.deflect || "Ask me something else.";
    }
    const answer = suspect.answers?.[key];
    return answer || suspect.deflect || "I do not know anything about that.";
}

function isCulprit(suspect) {
    return state.case.culprit === suspect.name;
}

function historyFor(suspect, limit = 8) {
    const said = state.transcript.filter((entry) => entry.suspect === suspect.name && entry.kind !== "slip").slice(-limit);
    if (!said.length) return "You have not asked them anything yet.";
    return said.map((entry) => `Q: ${entry.ask}\nA: ${entry.reply}`).join("\n");
}

async function suspectReply(suspect, question) {
    const system = [
        `You are ${suspect.name}, ${suspect.role}, being questioned in a murder investigation on the evening of the killing.`,
        "Answer in character, first person, two to four sentences, in plain period-appropriate English. No stage directions, no quotation marks around your answer, never mention that you are an AI or a character.",
        "Stay strictly consistent with your sheet:",
        `- what you say in public: ${suspect.alibi}`,
        `- what you are hiding: ${suspect.secret}`,
        `- the one fact that gives you away: ${suspect.slip}`,
        isCulprit(suspect)
            ? "- You are the killer. Deny it, deflect, stay calm. Do not confess unless the detective names the exact fact that traps you, and even then only for one sentence."
            : "- You did not kill anyone, but you are hiding the thing above for your own reasons. Do not confess to the murder.",
        "- Never invent facts about the other suspects that are not in your sheet; if you do not know, say so in character.",
    ].join("\n");
    const user = `What you have already told this detective:\n${historyFor(suspect)}\n\nThe detective asks: ${question}\n\nAnswer as ${suspect.name}.`;
    const reply = (await chat(state.aiModel, system, user)).trim();
    return reply || suspect.deflect || "Ask me again.";
}

/* --------------------------------------------------------------------- voice */

let audio = null;

function voiceFor(index) {
    if (state.voiceMode === "silent") return "";
    if (state.voiceMode === "pollinations" && state.mode === "key" && state.voiceList.length) {
        return state.voiceList[index % state.voiceList.length];
    }
    return "device";
}

function stopVoice() {
    if (audio) {
        audio.pause();
        audio = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
}

function deviceVoice(text, index) {
    if (!window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = 0.8 + (index % 4) * 0.18;
    utterance.rate = 0.94 + (index % 3) * 0.07;
    window.speechSynthesis.speak(utterance);
}

async function speak(text, index) {
    stopVoice();
    if (!text) return;
    const voice = voiceFor(index);
    if (!voice) return;
    if (voice === "device") {
        deviceVoice(text, index);
        return;
    }
    try {
        const response = await fetch(`${GEN}/v1/audio/speech`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({
                model: state.voiceModel || "elevenlabs/eleven-v3",
                input: text,
                voice,
                response_format: "mp3",
            }),
        });
        if (!response.ok) throw new Error(await apiError(response, "voice"));
        const url = URL.createObjectURL(await response.blob());
        audio = new Audio(url);
        audio.addEventListener("ended", () => URL.revokeObjectURL(url));
        await audio.play();
    } catch (error) {
        toast(`${error.message} Reading it with this device's voice instead.`);
        deviceVoice(text, index);
    }
}

/* ------------------------------------------------------------------ the run */

function resetRun() {
    state.asked = {};
    state.transcript = [];
    state.slipped = [];
    state.accusation = "";
    state.suspectIndex = 0;
    stopVoice();
}

function suspectIndex(name) {
    return Math.max(0, (state.case?.suspects || []).findIndex((suspect) => suspect.name === name));
}

function noteSlip(suspect) {
    if (state.slipped.includes(suspect.name)) return;
    state.slipped.push(suspect.name);
    state.transcript.push({ suspect: suspect.name, kind: "slip", ask: "", reply: suspect.slip });
}

function askKey(key) {
    const suspect = current();
    const reply = answerFor(suspect, key);
    const withheld = reply === suspect.deflect;
    if (!withheld) {
        const list = state.asked[suspect.name] || (state.asked[suspect.name] = []);
        if (!list.includes(key)) list.push(key);
    }
    state.transcript.push({ suspect: suspect.name, ask: questionText(key), reply, kind: "menu", key });
    if (key === "secret" && !withheld && suspect.slip) noteSlip(suspect);
    paintRoom();
    speak(reply, suspectIndex(suspect.name));
}

async function askFree(text) {
    const question = String(text || "").trim();
    if (!question) return;
    const suspect = current();
    if (state.mode !== "key") {
        const key = matchQuestion(question);
        if (key) {
            askKey(key);
            return;
        }
        state.transcript.push({
            suspect: suspect.name,
            ask: question,
            reply: suspect.deflect || "Ask me something I can answer.",
            kind: "menu",
            key: "",
        });
        paintRoom();
        speak(suspect.deflect || "Ask me something I can answer.", suspectIndex(suspect.name));
        toast("Offline they only answer the nine questions on the list — that one did not match any of them. Sign in to ask them anything.");
        return;
    }
    if (state.busy) return;
    state.busy = true;
    el.pressedNote.textContent = `${suspect.name} is thinking…`;
    try {
        const reply = await suspectReply(suspect, question);
        state.transcript.push({ suspect: suspect.name, ask: question, reply, kind: "typed" });
        paintRoom();
        speak(reply, suspectIndex(suspect.name));
    } catch (error) {
        toast(error.message);
    } finally {
        state.busy = false;
    }
}

async function toggleRecord() {
    if (state.recording) {
        state.recorder?.stop();
        return;
    }
    if (state.mode !== "key") {
        toast("Asking out loud needs a signed-in key — the transcription is billed to your own Pollen.");
        return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        toast("This browser will not give the page a microphone. Type the question instead.");
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const chunks = [];
        const recorder = new MediaRecorder(stream);
        state.recorder = recorder;
        recorder.addEventListener("dataavailable", (event) => {
            if (event.data.size) chunks.push(event.data);
        });
        recorder.addEventListener("stop", async () => {
            stream.getTracks().forEach((track) => track.stop());
            state.recording = false;
            el.record.textContent = "Ask out loud";
            await transcribe(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        });
        recorder.start();
        state.recording = true;
        el.record.textContent = "Stop and ask";
    } catch {
        toast("The microphone was refused. Type the question instead.");
    }
}

async function transcribe(blob) {
    const form = new FormData();
    form.append("file", blob, "question.webm");
    form.append("model", state.transcribeModel || "openai/whisper-1");
    try {
        el.pressedNote.textContent = "Writing down what you said…";
        const response = await fetch(`${GEN}/v1/audio/transcriptions`, {
            method: "POST",
            headers: authHeaders(),
            body: form,
        });
        if (!response.ok) throw new Error(await apiError(response, "transcription"));
        const data = await response.json();
        const text = String(data?.text || "").trim();
        if (!text) {
            toast("That came back empty. Try again, closer to the microphone.");
            paintRoom();
            return;
        }
        el.freeQuestion.value = text;
        await askFree(text);
    } catch (error) {
        toast(error.message);
        paintRoom();
    }
}

/* ------------------------------------------------------------------ the screens */

function render() {
    for (const name of SCREENS) el[name].classList.toggle("hidden", state.screen !== name);
}

function showBriefing() {
    const data = state.case;
    el.caseTitle.textContent = data.title;
    el.caseWhen.textContent = data.when;
    el.caseVictim.textContent = data.victim;
    el.caseBrief.textContent = data.brief;
    el.suspectList.innerHTML = "";
    for (const suspect of data.suspects) {
        const card = document.createElement("article");
        card.className = "suspect-card";
        const name = document.createElement("h3");
        name.textContent = suspect.name;
        const role = document.createElement("p");
        role.className = "fine";
        role.textContent = suspect.role;
        const alibi = document.createElement("p");
        alibi.className = "premise";
        alibi.textContent = `Says: ${suspect.alibi}`;
        card.append(name, role, alibi);
        el.suspectList.append(card);
    }
    state.screen = "briefing";
    render();
}

function paintRoom() {
    const suspect = current();
    el.roomKicker.textContent = `Case ${state.cases} — ${state.case.title}`;
    el.suspectChips.innerHTML = "";
    state.case.suspects.forEach((entry, index) => {
        const chip = document.createElement("button");
        chip.className = `chip-btn${index === state.suspectIndex ? " on" : ""}`;
        chip.textContent = entry.name;
        chip.addEventListener("click", () => {
            state.suspectIndex = index;
            stopVoice();
            paintRoom();
        });
        el.suspectChips.append(chip);
    });
    el.suspectName.textContent = suspect.name;
    el.suspectRole.textContent = suspect.role;
    el.suspectLook.textContent = suspect.look;

    el.transcript.innerHTML = "";
    const said = state.transcript.filter((entry) => entry.suspect === suspect.name);
    if (!said.length) {
        const empty = document.createElement("p");
        empty.className = "fine";
        empty.textContent = "They are waiting. Ask them something.";
        el.transcript.append(empty);
    }
    for (const entry of said) {
        if (entry.kind === "slip") {
            const note = document.createElement("p");
            note.className = "slip";
            note.textContent = `Loose end — ${entry.reply}`;
            el.transcript.append(note);
            continue;
        }
        const ask = document.createElement("p");
        ask.className = "ask";
        ask.textContent = entry.ask;
        const reply = document.createElement("p");
        reply.className = "reply";
        reply.textContent = entry.reply;
        el.transcript.append(ask, reply);
    }

    el.questionMenu.innerHTML = "";
    const answered = state.asked[suspect.name] || [];
    for (const item of menu()) {
        const button = document.createElement("button");
        button.className = `menu-btn${answered.includes(item.key) ? " done" : ""}`;
        button.textContent = item.ask;
        button.addEventListener("click", () => askKey(item.key));
        el.questionMenu.append(button);
    }

    const pressed = pressedCount(suspect.name);
    el.pressedNote.textContent = pressed
        ? `You have asked ${suspect.name} ${pressed} question${pressed === 1 ? "" : "s"}.`
        : `Nothing asked yet.`;

    const free = state.mode === "key";
    el.freeQuestion.placeholder = free
        ? "Ask anything at all"
        : "Ask in your own words — offline they answer the nine questions above";
    el.record.title = free
        ? `Records, transcribes with ${state.transcribeModel || "the audio model"} and asks it — billed to your own Pollen`
        : "Sign in to ask out loud";

    state.screen = "room";
    render();
}

function paintNotebook() {
    el.notes.innerHTML = "";
    const suspects = state.case.suspects;
    for (const suspect of suspects) {
        const block = document.createElement("article");
        block.className = "note-block";
        const head = document.createElement("h3");
        head.textContent = `${suspect.name} — ${suspect.role}`;
        block.append(head);
        const said = state.transcript.filter((entry) => entry.suspect === suspect.name);
        if (!said.length) {
            const empty = document.createElement("p");
            empty.className = "fine";
            empty.textContent = "Not questioned yet.";
            block.append(empty);
        }
        for (const entry of said) {
            const line = document.createElement("p");
            if (entry.kind === "slip") {
                line.className = "slip";
                line.textContent = `Loose end — ${entry.reply}`;
            } else {
                line.className = "reply";
                line.textContent = `${entry.ask} → ${entry.reply}`;
            }
            block.append(line);
        }
        el.notes.append(block);
    }

    el.looseEnds.innerHTML = "";
    if (!state.slipped.length) {
        const empty = document.createElement("p");
        empty.className = "fine";
        empty.textContent = `Nothing has slipped yet. A suspect usually holds something back for the first ${PRESSED} questions — press the last question and listen to how they answer it.`;
        el.looseEnds.append(empty);
    }
    for (const name of state.slipped) {
        const suspect = suspects.find((entry) => entry.name === name);
        const line = document.createElement("p");
        line.className = "slip";
        line.textContent = `${name}: ${suspect?.slip || ""}`;
        el.looseEnds.append(line);
    }

    state.screen = "notebook";
    render();
}

function paintAccuse() {
    el.accuseList.innerHTML = "";
    for (const suspect of state.case.suspects) {
        const button = document.createElement("button");
        button.className = "menu-btn";
        button.textContent = `It was ${suspect.name}`;
        button.addEventListener("click", () => accuse(suspect.name));
        el.accuseList.append(button);
    }
    state.screen = "accuse";
    render();
}

function accuse(name) {
    state.accusation = name;
    const right = name === state.case.culprit;
    if (right) state.score.right += 1;
    else state.score.wrong += 1;
    showReveal();
}

function showReveal() {
    const data = state.case;
    const right = state.accusation === data.culprit;
    el.verdict.textContent = right
        ? `You named ${data.culprit}. That is the one.`
        : `You named ${state.accusation}. That is not the one.`;
    el.culprit.textContent = right ? data.verdict : `${data.culprit} did it. ${data.verdict}`;
    el.solution.textContent = data.solution;
    el.breaks.innerHTML = "";
    for (const suspect of data.suspects) {
        const line = document.createElement("p");
        line.className = suspect.name === data.culprit ? "slip" : "reply";
        line.textContent = `${suspect.name} — ${data.breaks[suspect.name] || suspect.slip}`;
        el.breaks.append(line);
    }
    el.again.textContent = state.mode === "key" && state.source === "ai" ? "Another case" : "Question them again";
    const score = document.createElement("p");
    score.className = "fine";
    score.textContent = `Cases solved ${state.score.right}, missed ${state.score.wrong}. ${state.source === "pack" ? "Starter case." : "Written for you."}`;
    el.breaks.append(score);
    state.screen = "reveal";
    render();
}

async function openCase() {
    stopVoice();
    resetRun();
    el.open.disabled = true;
    el.open.textContent = "Opening the case…";
    try {
        if (state.source === "ai" && state.mode === "key") {
            const data = await hostCase();
            state.case = normalizeCase(data);
            state.cases += 1;
            state.source = "ai";
        } else {
            loadPackCase();
            state.cases += 1;
        }
    } catch (error) {
        toast(`${error.message} Opening the starter case instead.`);
        try {
            loadPackCase();
            state.cases += 1;
        } catch (fatal) {
            toast(fatal.message);
            el.open.disabled = false;
            el.open.textContent = "Open the case";
            return;
        }
    }
    el.open.disabled = false;
    el.open.textContent = "Open the case";
    showBriefing();
}

/* --------------------------------------------------------------------- auth */

function useKey(token, scope) {
    state.token = token;
    state.mode = "key";
    sessionStorage.setItem(SS.token, token);
    el.mode.textContent = scope?.includes("usage") ? "your own pollen" : "your own key";
    el.mode.classList.add("on");
    el.signin.classList.add("hidden");
    el.signout.classList.remove("hidden");
    el.signinBox.open = false;
    el.setupNote.textContent = "Signed in. The host writes a new case each time, answers questions that are not on the list, and speaks in a different voice per suspect — on your own Pollen.";
    syncMode();
    refreshWallet();
    loadModels();
    savePrefs();
}

function signOut() {
    state.token = "";
    state.mode = "free";
    state.voiceList = [];
    sessionStorage.removeItem(SS.token);
    el.mode.textContent = "starter case";
    el.mode.classList.remove("on");
    el.signin.classList.remove("hidden");
    el.signout.classList.add("hidden");
    el.wallet.classList.add("hidden");
    state.source = "pack";
    state.voiceMode = "browser";
    el.setupNote.textContent = "Offline this is one complete case — four suspects, every question answered, the device's own voice. Sign in and the host writes a new case each time, answers questions that are not on the list, and speaks in four different voices — on your own Pollen.";
    syncMode();
    savePrefs();
}

async function startAuth() {
    const appkey = el.appkey.value.trim();
    if (appkey) localStorage.setItem(APPKEY, appkey);
    else localStorage.removeItem(APPKEY);
    const verifier = randomToken(32);
    const nonce = randomToken(16);
    sessionStorage.setItem(SS.verifier, verifier);
    sessionStorage.setItem(SS.state, nonce);
    const params = new URLSearchParams({
        response_type: "code",
        redirect_uri: APP_URL,
        client_id: appkey || location.hostname,
        scope: "profile usage",
        state: nonce,
        code_challenge: await s256(verifier),
        code_challenge_method: "S256",
        expiry: "30",
        budget: "25",
    });
    location.href = `${ENTER}/authorize?${params}`;
}

async function finishAuth(code, returnedState) {
    const verifier = sessionStorage.getItem(SS.verifier);
    const expected = sessionStorage.getItem(SS.state);
    sessionStorage.removeItem(SS.verifier);
    sessionStorage.removeItem(SS.state);
    if (!verifier) throw new Error("That sign-in attempt expired. Press sign in again.");
    if (expected && returnedState && expected !== returnedState) throw new Error("The sign-in state did not match. Press sign in again.");
    const appkey = localStorage.getItem(APPKEY);
    const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: APP_URL,
        code_verifier: verifier,
        client_id: appkey || location.hostname,
    });
    const response = await fetch(`${ENTER}/api/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    });
    if (!response.ok) throw new Error(await apiError(response, "sign-in"));
    const data = await response.json();
    if (!data?.access_token) throw new Error("No key came back from sign-in.");
    useKey(data.access_token, data.scope || "");
}

async function refreshWallet() {
    if (!state.token) {
        el.wallet.classList.add("hidden");
        return;
    }
    try {
        const response = await fetch(`${GEN}/account/balance`, { headers: authHeaders() });
        if (!response.ok) return;
        const value = findNumber(await response.json());
        if (value === null) return;
        el.wallet.textContent = `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} pollen`;
        el.wallet.title = "Your Pollinations balance";
        el.wallet.classList.remove("hidden");
    } catch {
        // the balance chip is a nicety, never a blocker
    }
}

function findNumber(data, depth = 0) {
    if (depth > 2 || !data || typeof data !== "object") return null;
    for (const key of ["pollen", "balance", "available", "remaining", "total", "amount"]) {
        if (typeof data[key] === "number") return data[key];
    }
    for (const value of Object.values(data)) {
        const found = findNumber(value, depth + 1);
        if (found !== null) return found;
    }
    return null;
}

/* --------------------------------------------------------------------- models */

async function listModels(kind) {
    const response = await fetch(`${GEN}/${kind}/models`);
    if (!response.ok) return [];
    const data = await response.json();
    const list = Array.isArray(data) ? data : data?.data ?? [];
    return list.filter((model) => model && typeof model === "object");
}

function fillSelect(select, items, selected, placeholder) {
    select.innerHTML = "";
    if (placeholder) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = placeholder;
        select.append(option);
    }
    for (const item of items) {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        select.append(option);
    }
    if (selected) {
        if (![...select.options].some((option) => option.value === selected)) {
            const option = document.createElement("option");
            option.value = selected;
            option.textContent = selected;
            select.prepend(option);
        }
        select.value = selected;
    }
    if (!select.value && select.options.length) select.selectedIndex = 0;
}

async function loadModels() {
    if (state.mode !== "key") return;
    try {
        const [texts, audios] = await Promise.all([listModels("text"), listModels("audio")]);
        fillSelect(
            el.textModel,
            texts
                .filter((model) => !model.community && model.name)
                .map((model) => ({ value: model.name, label: model.name })),
            state.aiModel,
            "openai",
        );
        const endpoints = (model) => model.supported_endpoints || [];
        const speech = audios.filter((model) => !model.community && model.name && endpoints(model).includes("/v1/audio/speech"));
        fillSelect(
            el.voiceModel,
            speech.map((model) => ({ value: model.name, label: model.name })),
            state.voiceModel,
            "elevenlabs/eleven-v3",
        );
        const chosen = speech.find((model) => model.name === el.voiceModel.value);
        state.voiceList = (chosen?.voices || []).slice();
        fillSelect(
            el.voice,
            state.voiceList.map((name) => ({ value: name, label: name })),
            state.voice,
            "one voice per suspect",
        );
        const hearings = audios.filter(
            (model) => !model.community && model.name && endpoints(model).includes("/v1/audio/transcriptions"),
        );
        state.transcribeModel = hearings[0]?.name || "";
    } catch {
        // keep whatever is already in the selects
    }
}

function syncMode() {
    const free = state.mode === "free";
    for (const node of [el.textModel, el.voiceModel, el.voice]) node.disabled = free;
    el.textModel.title = free ? "Sign in to choose the model that writes the case" : "";
    el.voiceModel.title = free ? "Sign in to choose the suspects' voices" : "";
    for (const option of el.source.options) {
        if (option.value === "ai") option.disabled = free;
    }
    if (free && el.source.value === "ai") el.source.value = "pack";
    for (const option of el.voiceMode.options) {
        if (option.value === "pollinations") option.disabled = free;
    }
    if (free && el.voiceMode.value === "pollinations") el.voiceMode.value = "browser";
    el.authNote.textContent = free
        ? "Sign-in is the authorization-code flow with PKCE. Nothing is stored beyond this tab."
        : "Signed in. Your key lives in this tab only; close the tab and it is gone.";
    el.source.value = free || state.source !== "ai" ? "pack" : "ai";
    el.voiceMode.value = free ? "browser" : state.voiceMode;
}

/* --------------------------------------------------------------------- prefs */

function savePrefs() {
    try {
        localStorage.setItem(
            PREF,
            JSON.stringify({
                source: state.source,
                voiceMode: state.voiceMode,
                aiModel: el.textModel.value || state.aiModel,
                voiceModel: el.voiceModel.value || state.voiceModel,
                voice: el.voice.value || state.voice,
            }),
        );
    } catch {
        // private mode; preferences are a nicety
    }
}

function loadPrefs() {
    try {
        const saved = JSON.parse(localStorage.getItem(PREF) || "{}");
        if (saved.source === "ai" || saved.source === "pack") state.source = saved.source;
        if (["browser", "pollinations", "silent"].includes(saved.voiceMode)) state.voiceMode = saved.voiceMode;
        if (typeof saved.aiModel === "string") state.aiModel = saved.aiModel;
        if (typeof saved.voiceModel === "string") state.voiceModel = saved.voiceModel;
        if (typeof saved.voice === "string") state.voice = saved.voice;
    } catch {
        // nothing saved yet
    }
}

/* ---------------------------------------------------------------------- wire */

function wire() {
    for (const id of [
        "setup", "source", "voice-mode", "text-model", "voice-model", "voice", "open", "setup-note",
        "signin-box", "oauth", "pastekey", "usekey", "appkey", "auth-note",
        "wallet", "mode", "signin", "signout", "toast",
        "briefing", "case-title", "case-when", "case-victim", "case-brief", "suspect-list", "read-case", "start",
        "room", "room-kicker", "suspect-chips", "suspect-name", "suspect-role", "suspect-look",
        "transcript", "question-menu", "free-question", "ask", "record", "pressed-note", "to-notebook", "to-accuse",
        "notebook", "notes", "loose-ends", "back-to-room",
        "accuse", "accuse-name", "accuse-list", "back-from-accuse",
        "reveal", "verdict", "culprit", "solution", "breaks", "again", "back",
    ]) {
        const key = id.replace(/-(\w)/g, (_, letter) => letter.toUpperCase());
        el[key] = $(id);
    }

    el.open.addEventListener("click", openCase);
    el.readCase.addEventListener("click", () => {
        const data = state.case;
        speak(`${data.title}. ${data.when} ${data.victim} ${data.brief}`, -1);
    });
    el.start.addEventListener("click", () => {
        state.suspectIndex = 0;
        paintRoom();
    });
    el.ask.addEventListener("click", () => {
        const text = el.freeQuestion.value;
        el.freeQuestion.value = "";
        askFree(text);
    });
    el.freeQuestion.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            const text = el.freeQuestion.value;
            el.freeQuestion.value = "";
            askFree(text);
        }
    });
    el.record.addEventListener("click", toggleRecord);
    el.toNotebook.addEventListener("click", paintNotebook);
    el.backToRoom.addEventListener("click", paintRoom);
    el.toAccuse.addEventListener("click", paintAccuse);
    el.backFromAccuse.addEventListener("click", paintRoom);
    el.again.addEventListener("click", async () => {
        stopVoice();
        if (state.mode === "key" && state.source === "ai") await openCase();
        else {
            resetRun();
            state.cases += 1;
            paintRoom();
        }
    });
    el.back.addEventListener("click", () => {
        stopVoice();
        state.screen = "setup";
        render();
    });
    el.source.addEventListener("change", () => {
        state.source = el.source.value;
        savePrefs();
    });
    el.voiceMode.addEventListener("change", () => {
        state.voiceMode = el.voiceMode.value;
        stopVoice();
        savePrefs();
    });
    for (const node of [el.textModel, el.voiceModel, el.voice]) node.addEventListener("change", savePrefs);
    el.oauth.addEventListener("click", () => startAuth().catch((error) => toast(error.message)));
    el.usekey.addEventListener("click", () => {
        const token = el.pastekey.value.trim();
        if (!token) {
            toast("Paste a key first.");
            return;
        }
        el.pastekey.value = "";
        useKey(token, "");
    });
    el.signout.addEventListener("click", signOut);
}

function init() {
    wire();
    loadPrefs();
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const returned = params.get("state");
    if (code) {
        history.replaceState({}, "", location.pathname);
        finishAuth(code, returned)
            .then(() => toast("Signed in. A fresh case and four voices are yours."))
            .catch((error) => toast(error.message));
    }
    const stored = sessionStorage.getItem(SS.token);
    if (stored) {
        state.token = stored;
        state.mode = "key";
        el.mode.textContent = "your own key";
        el.mode.classList.add("on");
        el.signin.classList.add("hidden");
        el.signout.classList.remove("hidden");
    }
    el.appkey.value = localStorage.getItem(APPKEY) || "";
    syncMode();
    render();
    if (state.mode === "key") {
        refreshWallet();
        loadModels();
    }
}

if (typeof document !== "undefined" && typeof window !== "undefined" && !window.__ALIBI_TEST__) {
    init();
}
