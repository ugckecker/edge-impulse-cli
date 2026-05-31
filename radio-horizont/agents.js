'use strict';

require('dotenv').config();

const OpenAI = require('openai').default;

function getClient() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not set. Copy radio-horizont/.env.example to radio-horizont/.env and add your key.');
    }
    return new OpenAI({ apiKey });
}

const AGENTS = {
    topicPicker: `You are a brilliant radio programmer for a science and history station.
Your task: pick ONE specific, fascinating, non-obvious topic from the given category.
The topic must be real, specific (not generic), and something most people have never heard of.
Return ONLY the topic name and a one-sentence hook — nothing else.
Do not number it, do not add headers.`,

    chiefEditor: `You are the chief editor of Radio Horizont, a radio station for curious minds.
Write a 220–260 word radio script on the given topic.
Tone: you are an intelligent, enthusiastic friend sharing something that genuinely amazes you.
Rules:
- Start with a single strong hook sentence that pulls the listener in immediately.
- No music cues, no [sound effects], no stage directions, no meta-text.
- Pure speaker text only — what would be spoken aloud.
- End with a short, memorable closing thought.
Return only the script text.`,

    researchAgent: `You are a fact-checker and research specialist.
Review the given radio script for factual accuracy.
Add exactly ONE surprising, non-obvious detail that most people do not know about this topic.
Weave it naturally into the text — do not add a new paragraph or break the flow.
Return only the improved script text. No comments, no annotations.`,

    audioAgent: `You are an audio script optimizer for spoken-word radio.
Rewrite the given script so it sounds natural when read aloud:
- Maximum 20 words per sentence.
- Use natural pauses (commas, em-dashes) where a speaker would breathe.
- Convert all numbers, years, and measurements to their spoken form (e.g. "1969" → "nineteen sixty-nine", "3.7 km" → "three point seven kilometers").
- Eliminate any phrase that reads well but sounds awkward spoken aloud.
Return only the optimized script text.`,

    safetyAgent: `You are the final production gate for Radio Horizont.
Your job:
1. Remove ALL meta-text: stage directions, speaker labels, [brackets], parenthetical notes, music cues.
2. Decide if this story has genuine life-or-death emotional weight (survival stories, last moments of historical figures, catastrophes). If yes, set "dramatic" to true.
3. Create a short, compelling title (4–8 words).
4. Return ONLY valid JSON in this exact format, with no markdown, no code fences, no extra text:
{"title":"...","text":"...","dramatic":false}`,
};

async function chat(systemPrompt, userContent, temperature = 0.7, jsonMode = false) {
    const client = getClient();
    const params = {
        model: 'gpt-4o-mini',
        temperature,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userContent  },
        ],
    };
    if (jsonMode) {
        params.response_format = { type: 'json_object' };
    }

    const res = await client.chat.completions.create(params);
    return res.choices[0].message.content.trim();
}

async function generateScript(category) {
    const specificTopic = await chat(AGENTS.topicPicker,   `Category: ${category}`,  0.9);
    const draft         = await chat(AGENTS.chiefEditor,   specificTopic,             0.7);
    const researched    = await chat(AGENTS.researchAgent, draft,                     0.3);
    const optimized     = await chat(AGENTS.audioAgent,    researched,                0.3);
    const finalRaw      = await chat(AGENTS.safetyAgent,   optimized,                 0.1, true);

    let parsed;
    try {
        parsed = JSON.parse(finalRaw);
    } catch (_) {
        // Fallback: strip markdown fences and retry
        const cleaned = finalRaw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
        parsed = JSON.parse(cleaned);
    }

    if (!parsed.title || !parsed.text) {
        throw new Error('safetyAgent returned incomplete JSON: ' + finalRaw);
    }

    return {
        title:    parsed.title,
        text:     parsed.text,
        dramatic: Boolean(parsed.dramatic),
    };
}

const STATION_ID_TEXT =
    'You are listening to Radio Horizont — ' +
    'the station for curious minds. ' +
    'Science, history, and the strange truth behind the world we live in. ' +
    'Stay with us.';

module.exports = { generateScript, STATION_ID_TEXT };
