import express from 'express';
const router = express.Router();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Chat completions — often slower / flakier than STT; retries + null entities let heuristics finish the job. */
const sarvamExtractEntities = async ({ apiKey, text }) => {
    const requestBody = JSON.stringify({
        model: 'sarvam-1',
        messages: [
            {
                role: 'system',
                content: `You are a taxi booking assistant in India. 
                    Extract the "pickup" and "drop" locations from the user's spoken request.
                    Return ONLY a valid JSON object in this format: {"pickup": "location_name", "drop": "location_name"}.
                    If a location is missing, use null.
                    Be smart: if they say "from home", "home" is the pickup. 
                    If they say "to the airport", "airport" is the drop.
                    Handle English, Hindi, and Malayalam, including transliterated speech text.
                    Examples:
                    - "I want to go from Vengara to Malappuram" => {"pickup":"Vengara","drop":"Malappuram"}
                    - "मुझे वेंगरा से मलप्पुरम जाना है" => {"pickup":"वेंगरा","drop":"मलप्पुरम"}
                    - "आई वांट टू गो फ्रॉम वैंगरा टू मालप्पुराम" => {"pickup":"वैंगरा","drop":"मालप्पुराम"}
                    - "എനിക്ക് വേങ്ങരയിൽ നിന്ന് മലപ്പുറത്തേക്ക് പോകണം" => {"pickup":"വേങ്ങര","drop":"മലപ്പുറം"}`
            },
            {
                role: 'user',
                content: text
            }
        ]
    });

    const maxAttempts = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const extractionResponse = await fetch('https://api.sarvam.ai/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-subscription-key': apiKey
                },
                body: requestBody
            });

            const extractionData = await extractionResponse.json().catch(() => ({}));

            if (!extractionResponse.ok) {
                lastError = new Error(
                    extractionData?.message || extractionData?.error || `HTTP ${extractionResponse.status}`
                );
                if (attempt < maxAttempts) {
                    await sleep(500 * attempt);
                    continue;
                }
                return { entities: { pickup: null, drop: null }, raw: extractionData };
            }

            let entities = { pickup: null, drop: null };
            try {
                const content = extractionData?.choices?.[0]?.message?.content ?? '';
                const jsonMatch = content.match(/\{.*\}/s);
                if (jsonMatch) {
                    entities = JSON.parse(jsonMatch[0]);
                }
            } catch (e) {
                console.error('Failed to parse entities from AI:', e);
            }

            return { entities, raw: extractionData };
        } catch (e) {
            lastError = e;
            const code = e?.cause?.code || e?.code;
            console.warn(`Sarvam chat/completions attempt ${attempt}/${maxAttempts} failed:`, code || e?.message);
            if (attempt < maxAttempts) {
                await sleep(700 * attempt);
            }
        }
    }

    console.warn('Sarvam entity extraction unavailable; using heuristic-only merge.', lastError?.cause || lastError);
    return { entities: { pickup: null, drop: null }, raw: null };
};

const sarvamSpeechToText = async ({
    apiKey,
    audioBuffer,
    filename = 'audio.webm',
    mimeType = 'audio/webm',
    languageCode = null
}) => {
    const normalizedMime = String(mimeType || 'audio/webm').split(';')[0].trim();
    const blob = new Blob([audioBuffer], { type: normalizedMime });

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const form = new FormData();
            form.append('file', blob, filename);
            form.append('model', 'saaras:v3');
            form.append('mode', 'transcribe');
            if (languageCode) {
                form.append('language_code', languageCode);
            }
            const sttResponse = await fetch('https://api.sarvam.ai/speech-to-text', {
                method: 'POST',
                headers: {
                    'api-subscription-key': apiKey
                },
                body: form
            });
            const sttData = await sttResponse.json().catch(() => ({}));
            return { ok: sttResponse.ok, status: sttResponse.status, data: sttData };
        } catch (e) {
            const label = languageCode || 'auto';
            console.warn(`Sarvam STT fetch attempt ${attempt}/2 failed (${label}):`, e?.cause?.code || e?.message);
            if (attempt === 2) {
                return {
                    ok: false,
                    status: 502,
                    data: { error: 'Network error calling Sarvam speech-to-text' }
                };
            }
            await sleep(400);
        }
    }

    return { ok: false, status: 502, data: { error: 'Network error calling Sarvam speech-to-text' } };
};

const getTranscriptFromSttData = (sttData) => {
    return (
        sttData?.transcript ||
        sttData?.text ||
        sttData?.output?.transcript ||
        sttData?.result?.transcript ||
        ''
    );
};

const getConfidenceFromSttData = (sttData) => {
    const candidates = [
        sttData?.confidence,
        sttData?.output?.confidence,
        sttData?.result?.confidence,
        sttData?.transcript_confidence
    ];
    const confidence = candidates.find((value) => typeof value === 'number' && Number.isFinite(value));
    return typeof confidence === 'number' ? confidence : null;
};

const charRatio = (text, regex) => {
    const value = String(text || '');
    if (!value.length) return 0;
    const matches = value.match(regex);
    return matches ? matches.length / value.length : 0;
};

const scoreTranscript = ({ transcript, confidence, expectedLanguageCode }) => {
    const cleanTranscript = String(transcript || '').trim();
    if (!cleanTranscript) return Number.NEGATIVE_INFINITY;

    const latinRatio = charRatio(cleanTranscript, /[A-Za-z]/g);
    const devanagariRatio = charRatio(cleanTranscript, /[\u0900-\u097F]/g);
    const malayalamRatio = charRatio(cleanTranscript, /[\u0D00-\u0D7F]/g);
    const wordCount = cleanTranscript.split(/\s+/).filter(Boolean).length;
    const confidenceScore = typeof confidence === 'number' ? confidence * 50 : 0;
    const baseScore = Math.min(cleanTranscript.length, 120) + Math.min(wordCount, 30) + confidenceScore;

    let scriptBonus = 0;
    if (expectedLanguageCode === 'en-IN') scriptBonus = latinRatio * 120;
    else if (expectedLanguageCode === 'hi-IN') scriptBonus = devanagariRatio * 120;
    else if (expectedLanguageCode === 'ml-IN') scriptBonus = malayalamRatio * 120;
    else scriptBonus = Math.max(latinRatio, devanagariRatio, malayalamRatio) * 70;

    return baseScore + scriptBonus;
};

const detectScriptRatios = (transcript) => {
    const cleanTranscript = String(transcript || '').trim();
    return {
        latinRatio: charRatio(cleanTranscript, /[A-Za-z]/g),
        devanagariRatio: charRatio(cleanTranscript, /[\u0900-\u097F]/g),
        malayalamRatio: charRatio(cleanTranscript, /[\u0D00-\u0D7F]/g),
        wordCount: cleanTranscript ? cleanTranscript.split(/\s+/).filter(Boolean).length : 0
    };
};

const englishWordRatio = (text) => {
    const words = String(text || '')
        .toLowerCase()
        .replace(/[^a-z\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
    if (!words.length) return 0;

    const commonEnglish = new Set([
        'i', 'want', 'have', 'need', 'to', 'go', 'from', 'pickup', 'drop', 'book',
        'ride', 'at', 'in', 'on', 'the', 'a', 'please', 'now'
    ]);
    const matched = words.filter((word) => commonEnglish.has(word)).length;
    return matched / words.length;
};

const hasMalayalamEnglishTransliteration = (text) => {
    const value = String(text || '').toLowerCase();
    const hints = ['ഐ', 'വാണ്ട്', 'ഹാവ്', 'നീഡ്', 'ടു', 'ഗോ', 'ഫ്രം', 'പിക്കപ്പ്', 'ഡ്രോപ്പ്'];
    return hints.filter((hint) => value.includes(hint.toLowerCase())).length >= 3;
};

const hasHindiEnglishTransliteration = (text) => {
    const value = String(text || '').toLowerCase();
    const hints = ['आई', 'वांट', 'हैव', 'नीड', 'टू', 'गो', 'फ्रॉम', 'पिकअप', 'ड्रॉप'];
    return hints.filter((hint) => value.includes(hint.toLowerCase())).length >= 3;
};

const transcribeWithLanguageSelection = async ({ apiKey, audioBuffer, filename, mimeType }) => {
    const languageCandidates = [null, 'en-IN', 'hi-IN', 'ml-IN'];
    const results = await Promise.all(
        languageCandidates.map(async (languageCode) => {
            const stt = await sarvamSpeechToText({
                apiKey,
                audioBuffer,
                filename,
                mimeType,
                languageCode
            });

            const sttData = stt.data || {};
            const transcript = getTranscriptFromSttData(sttData);
            const confidence = getConfidenceFromSttData(sttData);
            const script = detectScriptRatios(transcript);
            const detectedLanguage =
                sttData?.language_code ||
                sttData?.language ||
                sttData?.output?.language_code ||
                languageCode ||
                null;
            const score = stt.ok
                ? scoreTranscript({
                    transcript,
                    confidence,
                    expectedLanguageCode: languageCode
                })
                : Number.NEGATIVE_INFINITY;

            return {
                requestedLanguageCode: languageCode,
                detectedLanguage,
                transcript,
                confidence,
                script,
                score,
                stt
            };
        })
    );

    const successful = results.filter((result) => result.stt.ok);
    if (!successful.length) {
        const firstFailure = results.find((result) => !result.stt.ok);
        return {
            ok: false,
            status: firstFailure?.stt?.status || 502,
            data: firstFailure?.stt?.data || {},
            selected: null,
            allResults: results
        };
    }

    const validCandidates = successful.filter((candidate) => candidate.transcript && candidate.transcript.trim().length >= 3);
    const candidates = validCandidates.length ? validCandidates : successful;

    const byScoreDesc = [...candidates].sort((a, b) => b.score - a.score);
    const topByScore = byScoreDesc[0];

    const englishCandidate = byScoreDesc.find((candidate) =>
        candidate.script.wordCount >= 3 && candidate.script.latinRatio >= 0.55
    );
    const hindiCandidate = byScoreDesc.find((candidate) =>
        candidate.script.wordCount >= 2 && candidate.script.devanagariRatio >= 0.55
    );
    const malayalamCandidate = byScoreDesc.find((candidate) =>
        candidate.script.wordCount >= 2 && candidate.script.malayalamRatio >= 0.55
    );

    const englishLooksNatural = englishWordRatio(englishCandidate?.transcript || '') >= 0.35;
    const malayalamLooksLikeEnglish =
        !!malayalamCandidate && hasMalayalamEnglishTransliteration(malayalamCandidate.transcript);
    const hindiLooksLikeEnglish =
        !!hindiCandidate && hasHindiEnglishTransliteration(hindiCandidate.transcript);

    // Pick the language that is clearly dominant in script form.
    // This avoids forcing English transliteration when user actually speaks Malayalam/Hindi.
    let selected = topByScore;
    if (englishCandidate && englishLooksNatural && (malayalamLooksLikeEnglish || hindiLooksLikeEnglish)) {
        selected = englishCandidate;
    } else if (malayalamCandidate && malayalamCandidate.score >= topByScore.score - 12) {
        selected = malayalamCandidate;
    } else if (hindiCandidate && hindiCandidate.score >= topByScore.score - 12) {
        selected = hindiCandidate;
    } else if (englishCandidate) {
        selected = englishCandidate;
    }

    return {
        ok: true,
        status: selected.stt.status,
        data: selected.stt.data,
        selected,
        allResults: results
    };
};

const normalizePlace = (value) => {
    if (!value || typeof value !== 'string') return null;
    const cleaned = value
        .replace(/^(from|to|pickup|drop|going to|go to)\s+/i, '')
        .replace(/^(से|फ्रॉम|फ्राम|टू|टु)\s+/i, '')
        .replace(/^[\s"'`.,;:!?।]+|[\s"'`.,;:!?।]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned.length ? cleaned : null;
};

/** Common English chunking mistakes from STT/heuristics — never treat as destinations. */
const INVALID_SINGLE_WORD_DROP = new Set([
    'go',
    'to',
    'from',
    'the',
    'a',
    'an',
    'here',
    'there',
    'now',
    'please',
    'yes',
    'no',
    'ok',
    'okay'
]);

const parseEntitiesHeuristic = (inputText) => {
    const text = String(inputText || '').trim();
    if (!text) return { pickup: null, drop: null };

    /**
     * "to … from …" ordering (e.g. "TO the mall FROM home") must not steal the first `\bto` from
     * phrases like "want TO GO FROM Kerala TO Delhi" (`from X to Y` defines the route).
     */
    const toFromMatch = text.match(/\bto\s+(.+?)\s+from\s+(.+)$/i);
    if (toFromMatch) {
        /* "want … to GO FROM place" binds the misleading first \bto…\bfrom span */
        const isMotionToFromBridge =
            /\b(?:want|needs?|needed|wish|would like)\s+to\s+(?:go|get|come|travel|head|drive|reach)\s+from\b/i.test(
                text
            );
        if (!isMotionToFromBridge) {
            const betweenWords = String(toFromMatch[1] || '')
                .trim()
                .split(/\s+/)
                .filter(Boolean);
            if (betweenWords.length >= 1 && betweenWords.length <= 6) {
                return {
                    pickup: normalizePlace(toFromMatch[2]),
                    drop: normalizePlace(toFromMatch[1])
                };
            }
        }
    }

    // English: "from pickup to drop" (primary trip pattern once "want … to go from …" was ruled out above)
    let m = text.match(/\bfrom\s+(.+?)\s+to\s+(.+)$/i);
    if (m) return { pickup: normalizePlace(m[1]), drop: normalizePlace(m[2]) };

    // "go / going / want … to …" destination only — avoid matching inner "want TO … FROM"
    m = text.match(/\b(?:going|headed)\s+to\s+(.+)$/i);
    if (m) return { pickup: null, drop: normalizePlace(m[1]) };
    m = text.match(/\bgo\s+to\s+(.+)$/i);
    if (m) return { pickup: null, drop: normalizePlace(m[1]) };

    const wantDest = text.match(/\b(?:need|want|wanna)\s+(?:to\s+)?(?:go|get)\s+to\s+(.+)$/i);
    if (wantDest) return { pickup: null, drop: normalizePlace(wantDest[1]) };

    const wantRide = text.match(/\b(?:need|want|wanna)\s+a\s+(?:ride|cab|auto|ricks?haw)\s+to\s+(.+)$/i);
    if (wantRide) return { pickup: null, drop: normalizePlace(wantRide[1]) };

    // Hindi: "… से …" — strip pronoun prefixes so pickup is the place before से, not "मैं मलप्पुरम".
    const seParts = text.split(/\s+से\s+/u);
    if (seParts.length >= 2) {
        const before = seParts[0].trim();
        const after = seParts.slice(1).join(' से ').trim();
        const beforeWords = before.split(/\s+/).filter(Boolean);
        const hindiPronounPrefix = /^(मैं|मुझे|हम|हमें|मुझको)$/u;
        let pickupRaw = before;
        if (beforeWords.length >= 2 && hindiPronounPrefix.test(beforeWords[0])) {
            pickupRaw = beforeWords.slice(1).join(' ');
        }
        let dropRaw = after
            .replace(/\s+जाना(\s+है|\s+चाहता|\s+चाहती|\s+चाहिए|\s+हूं|\s+हूँ)?.*$/u, '')
            .replace(/\s+चाहता(\s+हूं|\s+हूँ)?.*$/u, '')
            .replace(/\s+हूं.*$/u, '')
            .replace(/\s+हूँ.*$/u, '')
            .trim();
        dropRaw = dropRaw.replace(/[।.]+$/g, '').trim();
        const pickupH = normalizePlace(pickupRaw);
        const dropH = normalizePlace(dropRaw.split(/\s+/).slice(0, 5).join(' '));
        if (pickupH && dropH) {
            return { pickup: pickupH, drop: dropH };
        }
    }

    // Hindi transliterated in Devanagari: "फ्रॉम Y टू/टु X"
    m = text.match(/(?:फ्रॉम|फ्राम)\s+(.+?)\s+(?:टू|टु|टो)\s+(.+)$/i);
    if (m) return { pickup: normalizePlace(m[1]), drop: normalizePlace(m[2]) };

    // Hindi transliterated without explicit "to": "फ्रॉम Y X"
    // Use a conservative split so voice flow doesn't fail hard.
    m = text.match(/(?:फ्रॉम|फ्राम)\s+(.+?)\s+([^\s]+)$/i);
    if (m) return { pickup: normalizePlace(m[1]), drop: normalizePlace(m[2]) };

    // Malayalam patterns: "Y നിന്ന് X ലേക്ക്/വരെ"
    m = text.match(/(.+?)\s+നിന്ന്\s+(.+?)(?:ലേക്ക്|ിലേക്ക്|വരെ|\.|$)/);
    if (m) return { pickup: normalizePlace(m[1]), drop: normalizePlace(m[2]) };

    // Manglish / transliterated patterns: "from/frum ... to ...", "ഫ്രം ... ടു ..."
    m = text.match(/(?:from|frum|ഫ്രം)\s+(.+?)\s+(?:to|ടു)\s+(.+)$/i);
    if (m) return { pickup: normalizePlace(m[1]), drop: normalizePlace(m[2]) };

    return { pickup: null, drop: null };
};

const repairMergedTrip = (merged) => {
    let pickup = merged.pickup;
    let drop = merged.drop;
    const dropLc = typeof drop === 'string' ? drop.trim().toLowerCase() : '';
    const junkSingleDrop =
        dropLc &&
        !dropLc.includes(' ') &&
        INVALID_SINGLE_WORD_DROP.has(dropLc);

    if (
        pickup &&
        typeof pickup === 'string' &&
        /\s+to\s+/i.test(pickup) &&
        (!drop || junkSingleDrop)
    ) {
        const bits = pickup.split(/\s+to\s+/i).map((part) => normalizePlace(part));
        if (bits.length === 2 && bits[0] && bits[1]) {
            return { pickup: bits[0], drop: bits[1] };
        }
    }
    if (junkSingleDrop) {
        return { pickup, drop: null };
    }
    return merged;
};

const mergeEntities = (primary, fallback) =>
    repairMergedTrip({
        pickup: normalizePlace(primary?.pickup) || normalizePlace(fallback?.pickup) || null,
        drop: normalizePlace(primary?.drop) || normalizePlace(fallback?.drop) || null
    });

// Sarvam AI Entity Extraction & TTS (text-based)
router.post('/', async (req, res) => {
    try {
        const { text } = req.body;
        const apiKey = process.env.SARVAM_API_KEY;

        if (!text) {
            return res.status(400).json({ success: false, message: 'Text is required' });
        }

        if (!apiKey) {
            return res.status(500).json({ success: false, message: 'Sarvam API key not configured' });
        }

        // 1. Entity Extraction using Sarvam AI Chat/Completion
        const { entities } = await sarvamExtractEntities({ apiKey, text });
        const heuristic = parseEntitiesHeuristic(text);
        const mergedEntities = mergeEntities(entities, heuristic);

        if (!mergedEntities.pickup && !mergedEntities.drop) {
            return res.status(422).json({
                success: false,
                message: 'I couldn\'t catch the locations. Could you please repeat that?'
            });
        }

        // 2. Build confirmation response text
        let ttsText = '';
        if (mergedEntities.pickup && mergedEntities.drop) {
            ttsText = `Got it. Picking up from ${mergedEntities.pickup} and going to ${mergedEntities.drop}.`;
        } else if (mergedEntities.drop) {
            ttsText = `Sure, going to ${mergedEntities.drop}.`;
        } else {
            ttsText = `Detected pickup at ${mergedEntities.pickup}. Where would you like to go?`;
        }
        ttsText += " Please confirm your booking.";

        // Avoid local Python TTS in dev watch mode (it caused restarts/connection drops).
        return res.json({
            success: true,
            pickup: mergedEntities.pickup,
            drop: mergedEntities.drop,
            audioData: null,
            message: ttsText
        });

    } catch (error) {
        console.error('Voice booking error:', error);
        res.status(500).json({ success: false, message: 'Internal server error during voice processing' });
    }
});

// Sarvam STT + entity extraction + TTS (audio-based) — reliable in Brave/Cursor
router.post('/audio', async (req, res) => {
    try {
        const { audioBase64, mimeType, filename } = req.body;
        const apiKey = process.env.SARVAM_API_KEY;

        if (!audioBase64) {
            return res.status(400).json({ success: false, message: 'audioBase64 is required' });
        }
        if (!apiKey) {
            return res.status(500).json({ success: false, message: 'Sarvam API key not configured' });
        }

        const buffer = Buffer.from(audioBase64, 'base64');
        if (!buffer || buffer.length === 0) {
            return res.status(422).json({
                success: false,
                message: 'No audio data found. Please record again.'
            });
        }
        if (buffer.length < 4000) {
            console.warn('Very small audio payload received:', buffer.length, 'bytes');
        }

        const sttSelection = await transcribeWithLanguageSelection({
            apiKey,
            audioBuffer: buffer,
            filename: filename || 'audio.webm',
            mimeType: mimeType || 'audio/webm'
        });

        if (!sttSelection.ok) {
            console.error('Sarvam STT error:', { status: sttSelection.status, body: sttSelection.data });
            return res.status(502).json({
                success: false,
                message: sttSelection.data?.message || sttSelection.data?.error || `STT request failed (${sttSelection.status})`
            });
        }

        const sttData = sttSelection.data || {};
        const transcript = sttSelection.selected?.transcript || getTranscriptFromSttData(sttData);
        const candidateSummary = (sttSelection.allResults || []).map((result) => ({
            requested: result.requestedLanguageCode || 'auto',
            ok: result.stt?.ok,
            transcriptSample: String(result.transcript || '').slice(0, 60),
            latinRatio: result.script?.latinRatio ?? 0,
            devanagariRatio: result.script?.devanagariRatio ?? 0,
            malayalamRatio: result.script?.malayalamRatio ?? 0,
            score: Number.isFinite(result.score) ? Math.round(result.score) : null
        }));

        console.log('Sarvam STT response summary:', {
            status: sttSelection.status,
            hasTranscript: Boolean(transcript),
            language: sttSelection.selected?.detectedLanguage || sttData?.language_code || sttData?.language || sttData?.output?.language_code || null,
            requestedLanguage: sttSelection.selected?.requestedLanguageCode || null,
            confidence: sttSelection.selected?.confidence ?? null,
            audioBytes: buffer.length,
            candidates: candidateSummary
        });

        if (!transcript || transcript.length < 3) {
            return res.status(422).json({
                success: false,
                message: sttData?.message || sttData?.error || 'Could not transcribe audio. Please try again.'
            });
        }

        console.log('Sarvam STT transcript:', transcript);

        const { entities } = await sarvamExtractEntities({ apiKey, text: transcript });
        const heuristic = parseEntitiesHeuristic(transcript);
        const mergedEntities = mergeEntities(entities, heuristic);
        console.log('Entity extraction debug:', { transcript, entities, heuristic, mergedEntities });
        if (!mergedEntities.pickup && !mergedEntities.drop) {
            return res.status(422).json({ success: false, message: 'I could not detect pickup/drop from the transcript. Try again.' });
        }

        let ttsText = '';
        if (mergedEntities.pickup && mergedEntities.drop) {
            ttsText = `Got it. Picking up from ${mergedEntities.pickup} and going to ${mergedEntities.drop}.`;
        } else if (mergedEntities.drop) {
            ttsText = `Sure, going to ${mergedEntities.drop}.`;
        } else {
            ttsText = `Detected pickup at ${mergedEntities.pickup}. Where would you like to go?`;
        }
        ttsText += " Please confirm your booking.";
        // IMPORTANT:
        // In dev, backend runs with `node --watch`. Local TTS script writes files and can trigger
        // restarts mid-request, causing client-side "Error connecting to voice service".
        // Keep /audio route response-only for stability.
        return res.json({
            success: true,
            transcript,
            transcriptLanguage: sttSelection.selected?.detectedLanguage || null,
            pickup: mergedEntities.pickup,
            drop: mergedEntities.drop,
            audioData: null,
            message: ttsText
        });
    } catch (error) {
        console.error('Voice booking audio error:', error);
        res.status(500).json({ success: false, message: 'Internal server error during voice processing' });
    }
});

export default router;
