import express from 'express';
const router = express.Router();

const sarvamExtractEntities = async ({ apiKey, text }) => {
    const extractionResponse = await fetch('https://api.sarvam.ai/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-subscription-key': apiKey
        },
        body: JSON.stringify({
            model: 'sarvam-1',
            messages: [
                {
                    role: 'system',
                    content: `You are a taxi booking assistant in India. 
                    Extract the "pickup" and "drop" locations from the user's spoken request.
                    Return ONLY a valid JSON object in this format: {"pickup": "location_name", "drop": "location_name"}.
                    If a location is missing, use null.
                    Be smart: if they say "from home", "home" is the pickup. 
                    If they say "to the airport", "airport" is the drop.`
                },
                {
                    role: 'user',
                    content: text
                }
            ]
        })
    });

    const extractionData = await extractionResponse.json();
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
};

const sarvamSpeechToText = async ({
    apiKey,
    audioBuffer,
    filename = 'audio.webm',
    mimeType = 'audio/webm',
    languageCode = null
}) => {
    const form = new FormData();
    const normalizedMime = String(mimeType || 'audio/webm').split(';')[0].trim();
    const blob = new Blob([audioBuffer], { type: normalizedMime });
    form.append('file', blob, filename);
    form.append('model', 'saaras:v3');
    form.append('mode', 'transcribe');
    // Let Sarvam auto-detect spoken language when not explicitly provided.
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
};

const normalizePlace = (value) => {
    if (!value || typeof value !== 'string') return null;
    const cleaned = value
        .replace(/^(from|to|pickup|drop|going to|go to)\s+/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned.length ? cleaned : null;
};

const parseEntitiesHeuristic = (inputText) => {
    const text = String(inputText || '').trim();
    if (!text) return { pickup: null, drop: null };

    // English patterns: "to X from Y", "from Y to X", "go to X"
    let m = text.match(/\bto\s+(.+?)\s+from\s+(.+)$/i);
    if (m) return { pickup: normalizePlace(m[2]), drop: normalizePlace(m[1]) };

    m = text.match(/\bfrom\s+(.+?)\s+to\s+(.+)$/i);
    if (m) return { pickup: normalizePlace(m[1]), drop: normalizePlace(m[2]) };

    m = text.match(/\b(?:go|going|want to go)\s+to\s+(.+)$/i);
    if (m) return { pickup: null, drop: normalizePlace(m[1]) };

    // Hindi patterns: "Y से X", "Y से X जाना/जाना है"
    m = text.match(/(.+?)\s+से\s+(.+?)(?:\s+जाना.*)?$/);
    if (m) return { pickup: normalizePlace(m[1]), drop: normalizePlace(m[2]) };

    // Malayalam patterns: "Y നിന്ന് X ലേക്ക്/വരെ"
    m = text.match(/(.+?)\s+നിന്ന്\s+(.+?)(?:ലേക്ക്|ിലേക്ക്|വരെ|\.|$)/);
    if (m) return { pickup: normalizePlace(m[1]), drop: normalizePlace(m[2]) };

    // Manglish / transliterated patterns: "from/frum ... to ...", "ഫ്രം ... ടു ..."
    m = text.match(/(?:from|frum|ഫ്രം)\s+(.+?)\s+(?:to|ടു)\s+(.+)$/i);
    if (m) return { pickup: normalizePlace(m[1]), drop: normalizePlace(m[2]) };

    return { pickup: null, drop: null };
};

const mergeEntities = (primary, fallback) => {
    return {
        pickup: normalizePlace(primary?.pickup) || normalizePlace(fallback?.pickup) || null,
        drop: normalizePlace(primary?.drop) || normalizePlace(fallback?.drop) || null
    };
};

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

        const stt = await sarvamSpeechToText({
            apiKey,
            audioBuffer: buffer,
            filename: filename || 'audio.webm',
            mimeType: mimeType || 'audio/webm'
        });

        if (!stt.ok) {
            console.error('Sarvam STT error:', { status: stt.status, body: stt.data });
            return res.status(502).json({
                success: false,
                message: stt.data?.message || stt.data?.error || `STT request failed (${stt.status})`
            });
        }

        const sttData = stt.data || {};
        const transcript =
            sttData?.transcript ||
            sttData?.text ||
            sttData?.output?.transcript ||
            sttData?.result?.transcript ||
            '';

        console.log('Sarvam STT response summary:', {
            status: stt.status,
            hasTranscript: Boolean(transcript),
            language: sttData?.language_code || sttData?.language || sttData?.output?.language_code || null,
            audioBytes: buffer.length
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
