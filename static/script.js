document.addEventListener("DOMContentLoaded", () => {
            const chatBox = document.getElementById("chat-box");
            const userInput = document.getElementById("user-input");
            const sendBtn = document.getElementById("send-btn");
            const voiceBtn = document.getElementById("voice-btn");
            const langToggle = document.getElementById("lang-toggle");
            const saveChatBtn = document.getElementById("save-chat-btn");
            const newChatBtn = document.getElementById("new-chat-btn");
            const characterContainer = document.getElementById("character-section");
            const headerTitle = document.getElementById("header-title");

            let isSpeaking = false;
            let isListening = false;
            let languages = ['ar-SA', 'en-US', 'fr-FR'];
            let currentLangIndex = 0;
            let recognition;
            let audioContext;
            let currentAudioSource;
            let analyser;
            let frequencyData;
            let speakWelcomeMessage = true;
            let silenceTimer;
            
            const translations = {
                'en-US': { name: 'English', title: 'MOAYAD DUGHMOSH 3D AI Character', placeholder: 'Type your message or press 🎤 to speak', langToggle: 'Français', saveBtn: 'Save', newBtn: 'New', welcome: 'I am Sanad, your virtual assistant from Abu Dhabi Civil Defence. How can I help you today?', error: 'Error: ', voiceError: 'Voice recognition error: ', fetchError: 'Failed to connect to server.', noSupport: 'Speech recognition is not supported.', micPermission: 'Microphone access was denied. Please allow it in your browser settings.' },
                'fr-FR': { name: 'French', title: 'Personnage IA 3D par MOAYAD DUGHMOSH', placeholder: 'Écrivez votre message ou appuyez sur 🎤', langToggle: 'العربية', saveBtn: 'Sauver', newBtn: 'Nouveau', welcome: "Je suis Sanad, votre assistant virtuel de la Défense Civile d'Abu Dhabi. Comment puis-je vous aider aujourd'hui?", error: 'Erreur: ', voiceError: 'Erreur de reconnaissance vocale: ', fetchError: 'Échec de la connexion au serveur.', noSupport: "La reconnaissance vocale n'est pas prise en charge.", micPermission: "L'accès au microphone a été refusé. Veuillez l'autoriser dans les paramètres de votre navigateur." },
                'ar-SA': { name: 'Arabic', title: 'مؤيد دغمش لعالم الذكاء الاصطناعي', placeholder: 'اكتب رسالتك أو اضغط على 🎤 للتحدث', langToggle: 'English', saveBtn: 'حفظ', newBtn: 'جديد', welcome: 'انا سند، مساعدك الافتراضي في الدفاع المدني بأبوظبي. كيف يمكنني خدمتك اليوم؟', error: 'خطأ: ', voiceError: 'خطأ في التعرف على الصوت: ', fetchError: 'فشل الاتصال بالخادم.', noSupport: 'متصفحك لا يدعم التعرف على الصوت.', micPermission: 'تم رفض الوصول إلى الميكروفون. الرجاء السماح بالوصول في إعدادات المتصفح.' }
            };

            async function setLanguage(langCode, translate = false) {
                currentLangIndex = languages.indexOf(langCode);
                const isArabic = langCode === 'ar-SA';
                document.documentElement.lang = langCode.split('-')[0];
                document.documentElement.dir = isArabic ? 'rtl' : 'ltr';
                const t = translations[langCode];
                headerTitle.textContent = t.title;
                userInput.placeholder = t.placeholder;
                langToggle.textContent = translations[languages[(currentLangIndex + 1) % languages.length]].langToggle;
                saveChatBtn.textContent = t.saveBtn;
                newChatBtn.textContent = t.newBtn;
                if (translate) await translateChatHistory(langCode);
                setupSpeechRecognition();
            }

            langToggle.addEventListener('click', () => {
                const newLangIndex = (currentLangIndex + 1) % languages.length;
                setLanguage(languages[newLangIndex], true);
            });

            function appendMessage(sender, text = '', isError = false) {
                const messageDiv = document.createElement("div");
                messageDiv.className = `message ${sender}`;
                const bubble = document.createElement("div");
                bubble.className = 'bubble';
                bubble.textContent = text;
                if (isError) bubble.classList.add("error");
                messageDiv.appendChild(bubble);
                chatBox.appendChild(messageDiv);
                chatBox.scrollTop = chatBox.scrollHeight;
                return bubble;
            }

            async function sendMessage(message) {
                if (!message.trim()) return;
                appendMessage("user", message);
                saveChatHistory(); 
                userInput.value = "";
                const thinkingBubble = appendMessage("ai", "...");
                try {
                    const currentLangName = translations[languages[currentLangIndex]].name;
                    const response = await fetch("/api/ask", { 
                        method: "POST", headers: { "Content-Type": "application/json" }, 
                        body: JSON.stringify({ message: message, language: currentLangName }), 
                    });
                    const data = await response.json();
                    if (response.ok) { 
                        thinkingBubble.textContent = data.response; 
                        characterSpeak(data.response); 
                    } else { 
                        thinkingBubble.textContent = translations[languages[currentLangIndex]].error + data.error; 
                        thinkingBubble.classList.add("error"); 
                    }
                } catch (error) { 
                    thinkingBubble.textContent = translations[languages[currentLangIndex]].fetchError; 
                    thinkingBubble.classList.add("error"); 
                }
                saveChatHistory();
            }

            function initializeAudio() {
                if (!audioContext) {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    setupAudioAnalysis();
                    console.log("AudioContext initialized by user gesture.");
                    if(speakWelcomeMessage) {
                        characterSpeak(translations[languages[currentLangIndex]].welcome);
                        speakWelcomeMessage = false;
                    }
                }
            }
            async function characterSpeak(text) {
                if (!audioContext) {
                    appendMessage('ai', 'Click to enable audio.', true);
                    speakWelcomeMessage = true;
                    return;
                }
                const cleanText = text.replace(/\*/g, '');
                if (isSpeaking) stopSpeaking();
                isSpeaking = true;
                try {
                    const response = await fetch('/api/speak', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: cleanText })
                    });
                    if (!response.ok) throw new Error(`API error: ${response.statusText}`);
                    const audioData = await response.arrayBuffer();
                    const audioBuffer = await audioContext.decodeAudioData(audioData);
                    currentAudioSource = audioContext.createBufferSource();
                    currentAudioSource.buffer = audioBuffer;
                    currentAudioSource.connect(analyser);
                    analyser.connect(audioContext.destination);
                    currentAudioSource.start(0);
                    currentAudioSource.onended = stopSpeaking;
                } catch (error) {
                    console.error("Speech Error:", error);
                    appendMessage("ai", `Speech synthesis failed.`, true);
                    stopSpeaking();
                }
            }
            function stopSpeaking() {
                if (currentAudioSource) {
                    currentAudioSource.onended = null;
                    currentAudioSource.stop();
                    currentAudioSource = null;
                }
                isSpeaking = false;
            }
            
            function setupSpeechRecognition() {
                if ('webkitSpeechRecognition' in window) {
                    recognition = new webkitSpeechRecognition();
                    recognition.lang = languages[currentLangIndex];
                    recognition.continuous = true;
                    recognition.interimResults = true;
                    recognition.onstart = () => {
                        voiceBtn.classList.add("recording");
                        isListening = true;
                    };
                    recognition.onend = () => {
                        voiceBtn.classList.remove("recording");
                        isListening = false;
                    };
                    recognition.onresult = (event) => {
                        clearTimeout(silenceTimer);
                        let finalTranscript = '';
                        for (let i = event.resultIndex; i < event.results.length; ++i) {
                             if (event.results[i].isFinal) {
                                finalTranscript += event.results[i][0].transcript;
                            }
                        }
                        if (finalTranscript) {
                             userInput.value = finalTranscript;
                             sendMessage(finalTranscript);
                        }
                        silenceTimer = setTimeout(() => {
                           if(isListening) recognition.stop();
                        }, 2000);
                    };
                    recognition.onerror = (event) => {
                        if (event.error === 'not-allowed') {
                            appendMessage("ai", translations[languages[currentLangIndex]].micPermission, true);
                        } else { console.error("Voice recognition error:", event.error); }
                    };
                }
            }

            function saveChatHistory() { /* ... same as previous version ... */ }
            function loadChatHistory() { /* ... same as previous version ... */ }
            function startNewChat() { /* ... same as previous version ... */ }
            function saveChatToFile() { /* ... same as previous version ... */ }
            async function translateChatHistory(targetLang) { /* ... same as previous version ... */ }
            
            sendBtn.addEventListener("click", () => { initializeAudio(); sendMessage(userInput.value); });
            userInput.addEventListener("keypress", (e) => { if (e.key === "Enter") { initializeAudio(); sendMessage(userInput.value); }});
            voiceBtn.addEventListener("click", () => {
                 initializeAudio();
                 if (!recognition) {
                     alert(translations[languages[currentLangIndex]].noSupport);
                     return;
                 }
                 if (isListening) {
                     recognition.stop();
                 } else {
                     try { recognition.start(); } catch(e) {}
                 }
            });

            newChatBtn.addEventListener("click", startNewChat);
            saveChatBtn.addEventListener("click", saveChatToFile);
            
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(50, characterContainer.clientWidth / characterContainer.clientHeight, 0.1, 1000);
            const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
            renderer.setSize(characterContainer.clientWidth, characterContainer.clientHeight);
            renderer.setPixelRatio(window.devicePixelRatio);
            characterContainer.appendChild(renderer.domElement);
            
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
            const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
            keyLight.position.set(-5, 5, 5);
            scene.add(ambientLight, keyLight);
            
            const controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true; controls.dampingFactor = 0.05;
            
            let jaw, head, topLip, bottomLip;
            
            function createFirefighterCharacter() {
                 const characterGroup = new THREE.Group();
                const materials = {
                    skin: new THREE.MeshStandardMaterial({ color: '#C58C85', roughness: 0.6 }),
                    helmet: new THREE.MeshStandardMaterial({ color: '#FCD12A', metalness: 0.3, roughness: 0.2 }),
                    jacket: new THREE.MeshStandardMaterial({ color: '#2C3E50', roughness: 0.9 }),
                    stripe: new THREE.MeshStandardMaterial({ color: '#F1C40F', emissive: '#F1C40F', emissiveIntensity: 0.4 }),
                    beard: new THREE.MeshStandardMaterial({ color: '#4A3F35', roughness: 1 }),
                    eyes: new THREE.MeshBasicMaterial({color: 'white'}),
                    pupils: new THREE.MeshBasicMaterial({color: '#333'}),
                    lip: new THREE.MeshStandardMaterial({color: '#B06D61', roughness: 0.8})
                };

                const bodyShape = new THREE.CylinderGeometry(0.8, 1, 2.2, 32);
                const body = new THREE.Mesh(bodyShape, materials.jacket);
                body.position.y = -0.5;
                characterGroup.add(body);
                
                const legShape = new THREE.CylinderGeometry(0.4, 0.3, 2, 32);
                const leftLeg = new THREE.Mesh(legShape, materials.jacket);
                leftLeg.position.set(-0.4, -2.5, 0);
                characterGroup.add(leftLeg);
                const rightLeg = leftLeg.clone();
                rightLeg.position.x = 0.4;
                characterGroup.add(rightLeg);

                const stripeGeo = new THREE.TorusGeometry(0.85, 0.08, 8, 32);
                const stripe1 = new THREE.Mesh(stripeGeo, materials.stripe);
                stripe1.rotation.x = Math.PI / 2;
                stripe1.position.y = 0.2;
                characterGroup.add(stripe1);
                
                head = new THREE.Group();
                head.position.y = 1.1;
                const headShape = new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 32), materials.skin);
                head.add(headShape);
                characterGroup.add(head);

                const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 32, 0, Math.PI * 2, 0, Math.PI / 1.8), materials.helmet);
                helmet.position.y = 0.3;
                head.add(helmet);
                
                jaw = new THREE.Group();
                jaw.position.y = -0.1;
                const jawShape = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), materials.skin);
                jawShape.position.y = -0.3;
                jaw.add(jawShape);
                head.add(jaw);
                
                const nose = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.2), materials.skin);
                nose.position.set(0, 0.1, 0.65);
                head.add(nose);
                
                const lipGeometry = new THREE.BoxGeometry(0.35, 0.08, 0.1);
                topLip = new THREE.Mesh(lipGeometry, materials.lip);
                topLip.position.set(0, -0.1, 0.68);
                head.add(topLip);
                
                bottomLip = new THREE.Mesh(lipGeometry, materials.lip);
                bottomLip.position.set(0, -0.2, 0.4);
                jaw.add(bottomLip);

                const beard = new THREE.Mesh(new THREE.SphereGeometry(0.71, 32, 32, 0, Math.PI*2, Math.PI*0.6, Math.PI*0.4), materials.beard);
                beard.position.y = -0.15;
                head.add(beard);

                const eyeGroup = new THREE.Group();
                const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16,16), materials.eyes);
                const pupilR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16,16), materials.pupils);
                pupilR.position.z = 0.08;
                eyeR.add(pupilR);
                const eyeL = eyeR.clone();
                eyeR.position.x = 0.25; eyeL.position.x = -0.25;
                eyeGroup.add(eyeR, eyeL);
                eyeGroup.position.y = 0.2; eyeGroup.position.z = 0.6;
                head.add(eyeGroup);

                scene.add(characterGroup);
                
                camera.position.set(0, 1.5, 8);
                controls.target.set(0, 0.5, 0);
            }

            function setupAudioAnalysis() {
                analyser = audioContext.createAnalyser();
                analyser.fftSize = 128;
                frequencyData = new Uint8Array(analyser.frequencyBinCount);
            }

            let headIdleY = 0, headIdleX = 0;
            function animate() {
                requestAnimationFrame(animate);
                controls.update();
                const elapsedTime = clock.getElapsedTime();
                
                let mouthMovement = 0;
                if(isSpeaking && analyser) {
                    analyser.getByteFrequencyData(frequencyData);
                    let sum = 0;
                    for(let i = 0; i < frequencyData.length / 2; i++) { sum += frequencyData[i]; }
                    mouthMovement = sum / (frequencyData.length / 2) / 256;
                }

                if (jaw && topLip && bottomLip) {
                    const targetJawY = -0.1 - mouthMovement * 0.2; // Jaw moves down based on volume
                    const lipSeparation = mouthMovement * 0.1; // Lips separate
                    
                    jaw.position.y += (targetJawY - jaw.position.y) * 0.5;
                    topLip.position.y += (( -0.1 + lipSeparation) - topLip.position.y) * 0.5;
                    bottomLip.position.y += ((-0.2 - lipSeparation) - bottomLip.position.y) * 0.5;
                }
                
                if(head) {
                     headIdleX += ( (Math.sin(elapsedTime * 0.7) * 0.08) - head.rotation.x ) * 0.05;
                     headIdleY += ( (Math.sin(elapsedTime * 0.5) * 0.12) - head.rotation.y ) * 0.05;
                     head.rotation.set(headIdleX, headIdleY, 0);
                }
                renderer.render(scene, camera);
            }
            
            window.addEventListener('resize', () => {
                camera.aspect = characterContainer.clientWidth / characterContainer.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(characterContainer.clientWidth, characterContainer.clientHeight);
            });
            
            const clock = new THREE.Clock();
            setLanguage('ar-SA');
            createFirefighterCharacter();
            animate();
            loadChatHistory();
        });