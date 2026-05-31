import subprocess
from PIL import Image
import pytesseract
from backend.config import TESSERACT_CMD

pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD

def extract_text_from_image(image_path: str) -> str:
    """Extract text from PNG/JPG using Tesseract OCR."""
    try:
        img = Image.open(image_path)
        text = pytesseract.image_to_string(img)
        return text.strip()
    except Exception as e:
        print(f"OCR failed for {image_path}: {e}")
        return ""
