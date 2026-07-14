"""
Future AI capabilities — ARCHITECTURE ONLY (not implemented yet).

These stubs reserve the structure for upcoming Help2See features so they
can be added later behind the backend (keeping any API keys server-side),
without refactoring the routes or the plugin:

    • OCR                – extract text from images
    • image description  – generate alt text
    • transcription      – Whisper speech-to-text
    • simplification     – plain-language rewriting
    • translation        – on-the-fly translation

Each raises NotImplementedError until a concrete provider is wired in.
"""
from abc import ABC, abstractmethod


class AIProvider(ABC):
    name = "base"

    @abstractmethod
    def run(self, *args, **kwargs):
        ...


class OCRProvider(AIProvider):
    name = "ocr"
    def run(self, *args, **kwargs):
        raise NotImplementedError("OCR provider not configured yet.")


class ImageDescriptionProvider(AIProvider):
    name = "describe"
    def run(self, *args, **kwargs):
        raise NotImplementedError("Image description provider not configured yet.")


class TranscriptionProvider(AIProvider):
    name = "transcribe"
    def run(self, *args, **kwargs):
        raise NotImplementedError("Transcription (Whisper) provider not configured yet.")


class SimplificationProvider(AIProvider):
    name = "simplify"
    def run(self, *args, **kwargs):
        raise NotImplementedError("Text simplification provider not configured yet.")


class TranslationProvider(AIProvider):
    name = "translate"
    def run(self, *args, **kwargs):
        raise NotImplementedError("Translation provider not configured yet.")
