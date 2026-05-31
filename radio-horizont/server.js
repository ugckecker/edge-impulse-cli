'use strict';

require('dotenv').config();

const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const http     = require('http');

const { generateScript, STATION_ID_TEXT } = require('./agents');
const { synthesize, pruneAudioFiles, AUDIO_DIR } = require('./tts');
const { nextCategory } = require('./topics');

const PORT = Number(process.env.PORT) || 4916;
const HOST = process.env.HOST || '0.0.0.0';

const app    = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/audio', express.static(AUDIO_DIR));

// ── Queue state ──────────────────────────────────────────────────────────────
const queue = [];
let generating  = false;
let segmentCount = 0;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fillQueue() {
    if (generating || queue.length >= 3) return;
    generating = true;

    try {
        segmentCount++;
        let segment;

        if (segmentCount % 10 === 0) {
            // Station ID every 10th segment
            console.log('[QUEUE] Generating station ID...');
            const audioFile = await synthesize(STATION_ID_TEXT, false, 'station-id');
            segment = {
                title:    'Radio Horizont',
                text:     STATION_ID_TEXT,
                dramatic: false,
                audioFile: path.basename(audioFile),
                isStationId: true,
            };
        } else {
            const category = await nextCategory();
            console.log(`[QUEUE] Generating segment ${segmentCount} — category: ${category}`);

            const script = await generateScript(category);
            console.log(`[QUEUE] Script ready: "${script.title}" (dramatic: ${script.dramatic})`);

            const audioFile = await synthesize(script.text, script.dramatic, `segment-${segmentCount}`);
            console.log(`[QUEUE] Audio ready: ${path.basename(audioFile)}`);

            segment = {
                title:    script.title,
                text:     script.text,
                dramatic: script.dramatic,
                audioFile: path.basename(audioFile),
                isStationId: false,
            };
        }

        queue.push(segment);
        pruneAudioFiles(12);

    } catch (err) {
        console.error('[QUEUE] Generation failed:', err.message);
        // back off before retry
        await sleep(10000);
    } finally {
        generating = false;
        // keep queue topped up
        if (queue.length < 2) {
            setTimeout(fillQueue, 100);
        }
    }
}

// ── API ──────────────────────────────────────────────────────────────────────
app.get('/api/next', async (req, res) => {
    // Wait up to 3 minutes for something to arrive
    let waited = 0;
    while (queue.length === 0 && waited < 180000) {
        await sleep(500);
        waited += 500;
    }

    if (queue.length === 0) {
        return res.status(503).json({ error: 'Queue empty — generation may have failed, check server logs.' });
    }

    const segment = queue.shift();
    // Kick off more generation immediately
    setTimeout(fillQueue, 0);

    res.json(segment);
});

app.get('/api/status', (req, res) => {
    res.json({
        queueLength: queue.length,
        generating,
        segmentCount,
    });
});

// ── Boot ─────────────────────────────────────────────────────────────────────
server.listen(PORT, HOST, () => {
    if (!process.env.OPENAI_API_KEY) {
        console.error('[ERROR] OPENAI_API_KEY is not set. Copy .env.example to .env and add your key.');
        process.exit(1);
    }
    console.log(`\n  Radio Horizont`);
    console.log(`  ──────────────────────────────────────`);
    console.log(`  Open in browser → http://localhost:${PORT}`);
    console.log(`  Status          → http://localhost:${PORT}/api/status`);
    console.log(`  ──────────────────────────────────────\n`);

    // Pre-fill queue on startup
    fillQueue();
    setTimeout(fillQueue, 500);
});
