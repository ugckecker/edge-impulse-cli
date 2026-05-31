'use strict';

const { TopicFactory } = require('./topic-factory');

// ── Seed categories ──────────────────────────────────────────────────────────
// Curated, high-quality starting pool. The TopicFactory will continuously
// enrich this pool with AI-generated categories and retire weak ones.
const SEED_CATEGORIES = [
    // Human drama & history
    'Last hours of historical figures before their death',
    'Bizarre true survival stories — humans at the edge of life',
    'Cold War secrets: operations so strange they sound fictional',
    'Scientists who were laughed at — then proven completely right',
    'The archaeology of catastrophe: civilizations that ended in a day',
    'Lost languages, lost knowledge — civilizations erased from memory',

    // Science & nature
    'Accidental inventions that reshaped civilization',
    'Deep ocean mysteries: creatures and places science barely understands',
    'The mathematics of reality: counterintuitive truths that break intuition',
    'The most dangerous experiments in history and what they revealed',
    'Quantum physics phenomena that challenge everything we call real',
    'Animal intelligence: species that think in ways we never expected',

    // Improved / replaced weak entries
    'Medical breakthroughs buried by politics, money, or war',
    'Extreme environments where life should not exist — but does',
    'The unsolved engineering feats of pre-modern civilizations',
    'Space anomalies: things NASA observed that remain unexplained',
    'Extreme human adaptations: bodies pushed beyond believed limits',
    'The hidden architecture of cities built in impossible places',
    'Psychological phenomena that science cannot fully explain',
    'How humans discovered fire, language, and mathematics — and nearly lost them',
];

const factory = new TopicFactory(SEED_CATEGORIES);

async function nextCategory() {
    return factory.next();
}

module.exports = { nextCategory, CATEGORIES: SEED_CATEGORIES };
