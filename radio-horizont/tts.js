'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const AUDIO_DIR = path.join(__dirname, 'audio');
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

const VOICES = {
    normal:    'en-US-GuyNeural',
    dramatic:  'en-US-ChristopherNeural',
    stationId: 'en-US-GuyNeural',
};

function synthesize(text, dramatic, filenameBase) {
    return new Promise((resolve, reject) => {
        const filename = `${filenameBase}-${Date.now()}.mp3`;
        const filepath = path.join(AUDIO_DIR, filename);

        const voice = dramatic ? VOICES.dramatic : VOICES.normal;
        const rate  = dramatic ? '-15%' : '-5%';
        const pitch = dramatic ? '-3Hz'  : '+0Hz';

        const args = [
            '--voice', voice,
            '--rate',  rate,
            '--pitch', pitch,
            '--text',  text,
            '--write-media', filepath,
        ];

        // On Windows the edge-tts script is often not on PATH; fall back to
        // `py -m edge_tts` (Windows py launcher) or `python -m edge_tts`.
        const edgeTtsCmd = process.platform === 'win32'
            ? { cmd: 'py', args: ['-m', 'edge_tts', ...args] }
            : { cmd: 'edge-tts', args };

        const proc = spawn(edgeTtsCmd.cmd, edgeTtsCmd.args);

        let stderr = '';
        proc.stderr.on('data', d => { stderr += d.toString(); });

        proc.on('error', err => {
            reject(new Error(`edge-tts not found. Install via: pip install edge-tts\n${err.message}`));
        });

        proc.on('close', code => {
            if (code !== 0) {
                reject(new Error(`edge-tts exited with code ${code}: ${stderr}`));
            } else {
                resolve(filepath);
            }
        });
    });
}

// Keep only the last N audio files to avoid filling disk
function pruneAudioFiles(keepLast = 10) {
    try {
        const files = fs.readdirSync(AUDIO_DIR)
            .filter(f => f.endsWith('.mp3'))
            .map(f => ({ name: f, mtime: fs.statSync(path.join(AUDIO_DIR, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);

        for (const f of files.slice(keepLast)) {
            fs.unlinkSync(path.join(AUDIO_DIR, f.name));
        }
    } catch (_) { /* noop */ }
}

module.exports = { synthesize, pruneAudioFiles, AUDIO_DIR };
