'use strict';

/**
 * topic-factory.js
 *
 * AI-powered idea factory for Radio Horizont.
 *
 * Responsibilities:
 *  - Maintain a live pool of broadcast category ideas.
 *  - Dynamically generate new categories via GPT when the pool runs low.
 *  - Score every category for novelty and broadcast potential; retire weak ones.
 *  - Guarantee the station never repeats the same category twice in a row and
 *    gradually introduces completely new categories the static seed list never
 *    imagined.
 */

require('dotenv').config();

const OpenAI = require('openai').default;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Tunables ──────────────────────────────────────────────────────────────────
const POOL_MIN        = 10;   // trigger generation when pool drops below this
const BATCH_SIZE      = 8;    // how many new categories to request per call
const MAX_POOL        = 40;   // never keep more than this many to avoid staleness
const QUALITY_CUTOFF  = 6;    // score 1–10; discard anything below this
const AI_INJECT_RATIO = 0.5;  // 50% chance each call uses an AI-generated category

// ── System prompt for the category generator ─────────────────────────────────
const GENERATOR_PROMPT = `You are the creative director of Radio Horizont, a science and history radio station for intellectually curious adults.

Your task: generate ${BATCH_SIZE} completely NEW broadcast category ideas.

Rules:
- Each category is a SHORT thematic lens (NOT a specific story) — e.g. "The psychology of cults and mass belief", "Cold War proxy wars nobody talks about".
- Be bold. Avoid over-used tropes (ancient aliens, generic "mysteries of Egypt", clickbait "top 10"-style phrases).
- Span diverse fields: neuroscience, cryptography, linguistics, geology, music theory, economics, espionage, medicine, environmental science, engineering, anthropology, philosophy of science, etc.
- Every category must be specific enough that a journalist could immediately pitch five real stories under it.
- No category should overlap with any in the EXISTING list below.

EXISTING (do not repeat or paraphrase):
{{EXISTING}}

Return ONLY valid JSON — an array of objects with keys "category" (string) and "score" (integer 1–10 for how compelling this would be on radio, 10 = unmissable):
[{"category":"...","score":9}, ...]`;

// ── Quality evaluator prompt ──────────────────────────────────────────────────
const EVALUATOR_PROMPT = `You are a radio programming editor. Rate each of these broadcast category ideas for radio appeal (curiosity, drama, specificity). 
Score 1–10 where 10 = unmissable radio material.
Return ONLY valid JSON: [{"category":"...","score":N}, ...]`;

// ─────────────────────────────────────────────────────────────────────────────

class TopicFactory {
    constructor(seedCategories) {
        // pool: array of { category: string, score: number, usageCount: number }
        this._pool      = seedCategories.map(c => ({ category: c, score: 8, usageCount: 0 }));
        this._used      = new Set();  // recently used — for immediate dedup
        this._generating = false;
        this._roundIndex = 0;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Returns the next category string.
     * Asynchronous: may generate new categories in the background but always
     * returns immediately from the current pool.
     */
    async next() {
        // Kick off background generation if pool is running low
        if (this._pool.length < POOL_MIN && !this._generating) {
            this._generateBatch().catch(err =>
                console.error('[TopicFactory] Background generation failed:', err.message)
            );
        }

        // Decide: use AI-generated (pool slot) or seed
        const eligible = this._eligibleCandidates();

        if (eligible.length === 0) {
            // Emergency fallback — clear recent-used set and try again
            this._used.clear();
            const fallback = this._pool[Math.floor(Math.random() * this._pool.length)];
            return fallback ? fallback.category : 'Bizarre true survival stories — humans at the edge of life';
        }

        // Weighted random: higher-scored categories are more likely to be picked
        const pick = this._weightedPick(eligible);
        pick.usageCount++;
        this._used.add(pick.category);

        // Keep recent-used window at ~5
        if (this._used.size > 5) {
            const oldest = this._used.values().next().value;
            this._used.delete(oldest);
        }

        // Every 3rd call: inject a random bonus from the full pool for variety
        this._roundIndex++;
        if (this._roundIndex % 3 === 0 && Math.random() < AI_INJECT_RATIO) {
            const aiOnly = this._pool.filter(e => e._aiGenerated && !this._used.has(e.category));
            if (aiOnly.length > 0) {
                const bonus = aiOnly[Math.floor(Math.random() * aiOnly.length)];
                bonus.usageCount++;
                this._used.add(bonus.category);
                return bonus.category;
            }
        }

        return pick.category;
    }

    /** Return current pool stats — useful for debugging / monitoring. */
    poolStats() {
        const ai   = this._pool.filter(e => e._aiGenerated).length;
        const seed = this._pool.length - ai;
        return { total: this._pool.length, seed, ai, generating: this._generating };
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    _eligibleCandidates() {
        return this._pool.filter(e => !this._used.has(e.category));
    }

    _weightedPick(candidates) {
        const totalWeight = candidates.reduce((s, e) => s + e.score, 0);
        let r = Math.random() * totalWeight;
        for (const entry of candidates) {
            r -= entry.score;
            if (r <= 0) return entry;
        }
        return candidates[candidates.length - 1];
    }

    async _generateBatch() {
        if (this._generating) return;
        this._generating = true;

        try {
            console.log('[TopicFactory] Generating new category batch...');

            const existingList = this._pool.map(e => e.category).join('\n- ');
            const systemPrompt = GENERATOR_PROMPT.replace('{{EXISTING}}', existingList);

            const res = await client.chat.completions.create({
                model:           'gpt-4o-mini',
                temperature:     0.95,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user',   content: 'Generate the batch now.' },
                ],
            });

            let raw = res.choices[0].message.content.trim();

            // The model sometimes wraps the array in a top-level key
            let parsed;
            try {
                parsed = JSON.parse(raw);
            } catch (_) {
                raw = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
                parsed = JSON.parse(raw);
            }

            // Unwrap if wrapped in object key
            const arr = Array.isArray(parsed)
                ? parsed
                : (parsed.categories || parsed.items || parsed.results || Object.values(parsed)[0]);

            if (!Array.isArray(arr)) {
                throw new Error('Unexpected response shape from generator');
            }

            let added = 0;
            for (const item of arr) {
                if (!item.category || typeof item.score !== 'number') continue;
                if (item.score < QUALITY_CUTOFF) {
                    console.log(`[TopicFactory] Rejected (score ${item.score}): "${item.category}"`);
                    continue;
                }
                // Avoid near-duplicates (simple substring check)
                const alreadyExists = this._pool.some(e =>
                    e.category.toLowerCase().includes(item.category.toLowerCase().slice(0, 20))
                );
                if (alreadyExists) continue;

                this._pool.push({ category: item.category, score: item.score, usageCount: 0, _aiGenerated: true });
                added++;
                console.log(`[TopicFactory] Added (score ${item.score}): "${item.category}"`);
            }

            console.log(`[TopicFactory] Batch complete — added ${added} new categories. Pool size: ${this._pool.length}`);

            // Trim pool: remove lowest-scored, most-used entries if over MAX_POOL
            if (this._pool.length > MAX_POOL) {
                this._pool.sort((a, b) => {
                    // Prefer to retire: low score, high usage
                    const scoreA = a.score - a.usageCount * 0.5;
                    const scoreB = b.score - b.usageCount * 0.5;
                    return scoreA - scoreB; // ascending: worst first
                });
                const removed = this._pool.splice(0, this._pool.length - MAX_POOL);
                console.log(`[TopicFactory] Retired ${removed.length} weak/stale categories.`);
            }

        } catch (err) {
            console.error('[TopicFactory] Generation error:', err.message);
        } finally {
            this._generating = false;
        }
    }
}

module.exports = { TopicFactory };
