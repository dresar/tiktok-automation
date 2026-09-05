/**
 * Gemini Vision AI & Smart Auto-Rotation Engine (Fast 2026 Models, Max 5 Hashtags)
 * TikTok Studio Auto Uploader Pro
 */

class GeminiVisionEngine {
  constructor() {
    this.apiKeys = [];
    this.currentIndex = 0;
    this.baseUrl = "https://generativelanguage.googleapis.com/v1beta";
    this.models = ["gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-3.5-flash-lite"];
    this.currentModelIndex = 0;
    this.isLoaded = false;
  }

  async loadKeys() {
    if (this.isLoaded && this.apiKeys.length > 0) return true;

    try {
      const url = chrome.runtime.getURL('api_keys.json');
      const response = await fetch(url);
      const data = await response.json();
      if (data && Array.isArray(data.keys) && data.keys.length > 0) {
        this.apiKeys = data.keys;
        this.currentIndex = data.active_index || 0;
        if (data.base_url) this.baseUrl = data.base_url;
        if (Array.isArray(data.fast_models) && data.fast_models.length > 0) {
          this.models = data.fast_models;
        }
        this.isLoaded = true;
        return true;
      }
    } catch (e) {
      console.warn("[GeminiVisionEngine] Gagal memuat api_keys.json:", e);
    }
    return false;
  }

  getCurrentKey() {
    if (this.apiKeys.length === 0) return null;
    return this.apiKeys[this.currentIndex % this.apiKeys.length];
  }

  rotateKey(logger = null) {
    if (this.apiKeys.length <= 1) return;
    const oldIndex = this.currentIndex;
    this.currentIndex = (this.currentIndex + 1) % this.apiKeys.length;
    
    if (logger) {
      const masked = this.getCurrentKey().substring(0, 8) + '...';
      logger(`[Gemini AI] Rotasi key #${oldIndex + 1} -> #${this.currentIndex + 1} (${masked})`, "info");
    }
  }

  setApiKeys(keys) {
    if (Array.isArray(keys) && keys.length > 0) {
      this.apiKeys = keys;
      this.isLoaded = true;
    }
  }

  async generateText(prompt, model = null, logger = null) {
    await this.loadKeys();
    return this.generateCaption({
      videoFile: null,
      customPrompt: prompt,
      logger: logger
    });
  }

  /**
   * Ekstraksi 1 Frame Gambar dari File Video secara Asinkron (Canvas Rendering)
   */
  async extractVideoFrame(file, targetTimeSec = 1.5) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      
      const blobUrl = URL.createObjectURL(file);
      video.src = blobUrl;

      const timeout = setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        video.remove();
        reject(new Error("Timeout saat membaca frame video."));
      }, 12000);

      video.onloadedmetadata = () => {
        const seekTime = Math.min(targetTimeSec, Math.max(0.5, video.duration / 3));
        video.currentTime = seekTime;
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          const maxDim = 720;
          let width = video.videoWidth || 720;
          let height = video.videoHeight || 1280;

          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, width, height);

          const base64Data = canvas.toDataURL('image/jpeg', 0.80);
          const base64ImageOnly = base64Data.split(',')[1];

          clearTimeout(timeout);
          URL.revokeObjectURL(blobUrl);
          video.remove();
          canvas.remove();

          resolve(base64ImageOnly);
        } catch (err) {
          clearTimeout(timeout);
          URL.revokeObjectURL(blobUrl);
          video.remove();
          reject(err);
        }
      };

      video.onerror = (e) => {
        clearTimeout(timeout);
        URL.revokeObjectURL(blobUrl);
        video.remove();
        reject(new Error("Format video tidak didukung untuk ekstraksi visual."));
      };
    });
  }

  /**
   * Panggil Gemini Vision API dengan Batasan Maksimal 5 Hashtag
   */
  async generateCaptionAndHashtags(file, logger = null) {
    await this.loadKeys();

    if (this.apiKeys.length === 0) {
      throw new Error("Pool API Key kosong. Pastikan api_keys.json berisi daftar key.");
    }

    if (logger) logger(`[Gemini AI] Menganalisis frame video '${file.name}'...`, "info");

    let base64Image = null;
    try {
      base64Image = await this.extractVideoFrame(file, 1.5);
      if (logger) logger("✓ Frame video berhasil diekstraksi.", "info");
    } catch (e) {
      if (logger) logger(`Info frame: ${e.message}. Menggunakan analisis nama file...`, "warn");
    }

    const cleanFileName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");

    const systemPrompt = `Kamu adalah pakar Content Strategist & Copywriter TikTok Indonesia profesional.
Tugas kamu: Analisis visual gambar video dan nama file: "${cleanFileName}".
Buatkan 1 caption TikTok yang sangat menarik, natural, santai (gaya bahasa kekinian), hook kuat di baris pertama, singkat (1-2 baris), dan sertakan MAKSIMAL 3 SAMPAI 5 HASHTAG saja yang sedang viral/trending (contoh: #fyp #viral #tiktok...).
Aturan ketat: Maksimal 5 hashtag saja! Jangan ada pengantar atau tanda kutip. Langsung output teks caption dan hashtag.`;

    const contentsPayload = [];

    if (base64Image) {
      contentsPayload.push({
        role: "user",
        parts: [
          { text: systemPrompt },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: base64Image
            }
          }
        ]
      });
    } else {
      contentsPayload.push({
        role: "user",
        parts: [{ text: systemPrompt }]
      });
    }

    let lastError = null;
    const maxRetries = Math.min(this.apiKeys.length * 2, 25);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const apiKey = this.getCurrentKey();
      const model = this.models[this.currentModelIndex % this.models.length];
      const endpoint = `${this.baseUrl}/models/${model}:generateContent?key=${apiKey}`;

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: contentsPayload,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 180
            }
          })
        });

        if (response.ok) {
          const data = await response.json();
          const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidate && candidate.trim().length > 0) {
            const cleanText = candidate.trim().replace(/^["']|["']$/g, '');
            if (logger) logger(`[Gemini AI] ✓ Caption & Hashtag siap (${model})!`, "success");
            return cleanText;
          }
        }

        const errorStatus = response.status;
        const errText = await response.text();

        if (errorStatus === 429 || errorStatus === 403 || errorStatus === 400 || errText.includes("API_KEY_INVALID") || errText.includes("RESOURCE_EXHAUSTED") || errText.includes("Permission denied")) {
          this.rotateKey(logger);
          continue;
        } else if (errorStatus === 404) {
          this.currentModelIndex++;
          continue;
        } else {
          this.rotateKey(logger);
        }
      } catch (networkErr) {
        lastError = networkErr;
        this.rotateKey(logger);
      }
    }

    throw new Error(`Gagal memproses AI setelah rotasi multi-key: ${lastError?.message || 'Limit exceeded'}`);
  }
}

window.GeminiVisionEngine = GeminiVisionEngine;
