const mammoth = require('mammoth');

/**
 * Extract text from DOC/DOCX buffer
 * @param {Buffer} buffer - The DOC/DOCX file buffer
 * @returns {Promise<string>} - The extracted text
 */
exports.extractTextFromDocBuffer = async (buffer) => {
  try {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error('Invalid buffer provided');
    }

    const result = await mammoth.extractRawText({ buffer });

    if (result.messages && result.messages.length > 0) {
      console.log('[DOC Service] Messages:', result.messages);
    }

    return result.value || '';
  } catch (error) {
    console.error('[DOC Service] Error extracting text from DOC:', error);
    throw new Error(`Failed to extract text from DOC file: ${error.message}`);
  }
};

/**
 * Extract text from DOC/DOCX with HTML formatting (optional)
 * @param {Buffer} buffer - The DOC/DOCX file buffer
 * @returns {Promise<{text: string, html: string}>} - The extracted text and HTML
 */
exports.extractTextFromDocBufferWithFormatting = async (buffer) => {
  try {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error('Invalid buffer provided');
    }

    const [textResult, htmlResult] = await Promise.all([
      mammoth.extractRawText({ buffer }),
      mammoth.convertToHtml({ buffer })
    ]);

    return {
      text: textResult.value || '',
      html: htmlResult.value || ''
    };
  } catch (error) {
    console.error('[DOC Service] Error extracting text from DOC with formatting:', error);
    throw new Error(`Failed to extract text from DOC file: ${error.message}`);
  }
};