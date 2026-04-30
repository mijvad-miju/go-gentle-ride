import sys
import io
import base64
import soundfile as sf
import os
import io

# Optional: suppress extraneous warnings
import warnings
warnings.filterwarnings("ignore")

from kittentts import KittenTTS

def generate_tts(text):
    try:
        # Initialize the model (downloads automatically if not present)
        m = KittenTTS("KittenML/kitten-tts-mini-0.8")
        
        # Generate audio
        audio = m.generate(text, voice='Jasper')
        
        # Save to an in-memory byte buffer instead of file
        wav_io = io.BytesIO()
        sf.write(wav_io, audio, 24000, format='WAV', subtype='PCM_16')
        wav_io.seek(0)
        
        # Convert to base64
        wav_base64 = base64.b64encode(wav_io.read()).decode('utf-8')
        
        # Print JSON so Node.js can easily parse it
        import json
        print(json.dumps({"success": True, "audioBase64": wav_base64}))
        
    except Exception as e:
        import json
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        import json
        print(json.dumps({"success": False, "error": "No text provided"}))
        sys.exit(1)
        
    text_to_speak = sys.argv[1]
    
    # Redirect stdout briefly if kittentts prints stuff, though standard print does the trick 
    # if we just grab the last line in node.
    generate_tts(text_to_speak)
