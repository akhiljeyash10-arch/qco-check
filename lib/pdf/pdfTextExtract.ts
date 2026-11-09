/**
 * Minimal PDF text extractor for testing purposes.
 *
 * Decompresses the PDF content stream and decodes hex-encoded TJ arrays
 * (the format @react-pdf/renderer v4 uses with Helvetica fonts) back to
 * readable text. For test use only — not a full PDF parser.
 *
 * @module lib/pdf/pdfTextExtract
 */

import * as zlib from "zlib";
import { promisify } from "util";

const inflate = promisify(zlib.inflate);

/**
 * Extract all readable text from a PDF buffer by:
 *  1. Finding and decompressing the main content stream.
 *  2. Parsing hex-encoded TJ operator arguments (e.g. `<4953 2062> TJ`).
 *  3. Decoding hex byte sequences as UTF-8 (Helvetica uses WinAnsiEncoding,
 *     which is ASCII-compatible for printable characters).
 *
 * Returns a concatenated string of all text tokens found.
 */
export async function extractPdfText(buf: Buffer): Promise<string> {
  // Find the first compressed stream (FlateDecode).
  const streamMarker = Buffer.from("stream\n");
  const streamMarkerRN = Buffer.from("stream\r\n");
  let streamStart = -1;

  for (let i = 0; i < buf.length - 8; i++) {
    if (buf.slice(i, i + 7).equals(streamMarker)) {
      streamStart = i + 7;
      break;
    }
    if (buf.slice(i, i + 8).equals(streamMarkerRN)) {
      streamStart = i + 8;
      break;
    }
  }

  if (streamStart < 0) {
    return "";
  }

  // Find the end of the stream.
  const endMarker = Buffer.from("\nendstream");
  let endStart = -1;
  for (let i = streamStart; i < buf.length - 10; i++) {
    if (buf.slice(i, i + 10).equals(endMarker)) {
      endStart = i;
      break;
    }
  }
  if (endStart < 0) {
    endStart = buf.length;
  }

  // Decompress.
  let content: string;
  try {
    const decompressed = await inflate(buf.slice(streamStart, endStart));
    content = decompressed.toString("latin1");
  } catch {
    // Not compressed or wrong format; fall back to raw.
    content = buf.slice(streamStart, endStart).toString("latin1");
  }

  // Parse TJ arrays: [...<hex> num <hex> num...] TJ
  // Each <hexstring> is a sequence of bytes; we decode them as Windows-1252
  // (which is ASCII for the first 127 codepoints — Helvetica range).
  const parts: string[] = [];

  const TJRegex = /\[([^\]]*)\]\s*TJ/g;
  let match: RegExpExecArray | null;

  while ((match = TJRegex.exec(content)) !== null) {
    const inner = match[1];
    // Decode all hex tokens in the TJ array as a single concatenated string
    // (kerning numbers between tokens are spacing adjustments, not separators).
    const hexRegex = /<([0-9a-fA-F]+)>/g;
    let hexMatch: RegExpExecArray | null;
    let token = "";
    while ((hexMatch = hexRegex.exec(inner)) !== null) {
      const hex = hexMatch[1];
      // Decode hex bytes to characters (WinAnsiEncoding ≈ latin1 for 0x20-0x7e).
      for (let i = 0; i < hex.length; i += 2) {
        const byte = parseInt(hex.slice(i, i + 2), 16);
        if (byte >= 0x20) {
          token += String.fromCharCode(byte);
        }
      }
    }
    if (token) parts.push(token);
  }

  // Also collect Tj string literals: (text) Tj
  const TjRegex = /\(([^)]*)\)\s*Tj/g;
  while ((match = TjRegex.exec(content)) !== null) {
    parts.push(match[1]);
  }

  // Join tokens with a single space — each TJ call is a separate text run.
  return parts.join(" ");
}

/**
 * Check whether the PDF buffer contains the given text string (after
 * decompressing and decoding the content stream).
 */
export async function pdfContains(buf: Buffer, text: string): Promise<boolean> {
  const extracted = await extractPdfText(buf);
  return extracted.includes(text);
}
