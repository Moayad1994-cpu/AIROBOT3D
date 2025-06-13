import os
import json
import requests
import google.generativeai as genai
from flask import Flask, render_template, request, jsonify, Response
from dotenv import load_dotenv

load_dotenv()

# Load API keys from .env file
GEMINI_API_KEY = os.environ.get("GOOGLE_GEMINI_API_KEY")
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY")

if not GEMINI_API_KEY:
    print("🔴 FATAL ERROR: GOOGLE_GEMINI_API_KEY not found in .env file.")
    exit()

if not ELEVENLABS_API_KEY:
    print("🔴 FATAL ERROR: ELEVENLABS_API_KEY not found in .env file.")
    exit()

app = Flask(__name__)

# Configure Gemini API
try:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-1.5-flash-latest')
    print("✅ Google Gemini API configured successfully.")
except Exception as e:
    print(f"🔴 FATAL ERROR: Could not configure Gemini API: {e}")
    exit()

@app.route("/")
def index():
    """Serves the main HTML page."""
    return render_template("index.html")

@app.route("/api/ask", methods=["POST"])
def api_ask():
    data = request.json
    user_message = data.get("message", "")
    language = data.get("language", "Arabic")

    if not user_message:
        return jsonify({"error": "Message cannot be empty."}), 400

    system_prompt = (
        f"You are 'Sanad', a helpful AI assistant from the Abu Dhabi Civil Defence. "
        f"Your official role is to provide information and assistance related to civil defence services in Abu Dhabi. "
        f"The user is currently speaking {language}. You MUST respond fluently and exclusively in {language}. "
        f"Do not use markdown like asterisks (*). Based on this role, answer the user's query."
    )
    
    full_prompt = f"{system_prompt}\n\nUser Query: {user_message}"
    
    try:
        response = model.generate_content(full_prompt)
        ai_response = response.text
        return jsonify({"response": ai_response})
    except Exception as e:
        return jsonify({"error": f"An error occurred with the Gemini API: {str(e)}"}), 500

@app.route('/api/speak', methods=['POST'])
def api_speak():
    data = request.json
    text = data.get("text")
    
    if not text:
        return Response("Error: No text provided.", status=400)

    voice_id = 'RmK9zui2LVG4O12k3haP' 
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY
    }
    payload = {
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75
        }
    }

    try:
        response = requests.post(url, json=payload, headers=headers, stream=True)
        response.raise_for_status()
        return Response(response.iter_content(chunk_size=4096), mimetype='audio/mpeg')
    except requests.exceptions.RequestException as e:
        print(f"🔴 ElevenLabs API Error: {e}")
        error_message = f"Failed to generate audio. Status code: {e.response.status_code if e.response else 'N/A'}"
        return Response(error_message, status=500)

@app.route("/api/translate", methods=["POST"])
def api_translate():
    data = request.json
    texts = data.get("texts", [])
    target_lang_code = data.get("target_lang", "en-US")

    if not texts:
        return jsonify([])
        
    lang_map = {"en-US": "English", "ar-SA": "Arabic", "fr-FR": "French"}
    target_language = lang_map.get(target_lang_code, "English")

    try:
        prompt = (
            f"Translate the following JSON array of strings into {target_language}. "
            f"Your response must be ONLY a valid JSON array of strings, with translations in the same order. "
            f"Do not include any introductory text, explanations, or markdown formatting like ```json. "
            f"Input: {json.dumps(texts)}"
        )
        
        response = model.generate_content(prompt)
        cleaned_response = response.text.strip()
        translated_list = json.loads(cleaned_response)

        if isinstance(translated_list, list) and len(translated_list) == len(texts):
            return jsonify(translated_list)
        else:
            raise ValueError("Translated response is not a correctly formatted list.")
    except Exception as e:
        print(f"🔴 Translation Error: {e}. Response was: '{response.text}'")
        return jsonify({"error": "Failed to parse translation."}), 500

if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0')

