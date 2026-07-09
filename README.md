<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/39e4d714-1204-40f6-9334-be6938106460

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Surya OCR remoto

Para deploy, o OCR precisa rodar em um backend separado do frontend estático.

Guia rápido:
- Backend Surya: [docs/deploy-surya-ocr.md](docs/deploy-surya-ocr.md)
- Variável do frontend: `VITE_SURYA_OCR_URL`
