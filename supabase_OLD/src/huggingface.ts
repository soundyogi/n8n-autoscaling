import 'dotenv/config';

enum HuggingFaceErrorCode {
  API_FAILURE = 'HUGGINGFACE_API_FAILURE',
  INVALID_RESPONSE = 'HUGGINGFACE_INVALID_RESPONSE',
  RATE_LIMITED = 'HUGGINGFACE_RATE_LIMITED',
  AUTH_FAILURE = 'HUGGINGFACE_AUTH_FAILURE'
}

interface HuggingFaceError extends Error {
  code: HuggingFaceErrorCode;
  retryable: boolean;
}

class HuggingFaceService {
  private model: string;
  private dimensions: number;
  private apiKey: string;
  private baseUrl: string = 'https://api-inference.huggingface.co';

  constructor() {
    this.apiKey = process.env.HUGGINGFACE_API_KEY || '';
    this.model = process.env.EMBEDDING_MODEL || 'BAAI/bge-small-en-v1.5';
    this.dimensions = parseInt(process.env.EMBEDDING_DIMENSIONS || '384');
    
    if (!this.apiKey) {
      throw new Error('HUGGINGFACE_API_KEY environment variable is required');
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!text?.trim()) {
      throw new Error('Text cannot be empty');
    }

    try {
      // Use the correct HuggingFace Inference API endpoint for feature extraction
      const response = await fetch(`${this.baseUrl}/models/${this.model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: text, // Try single string input as per some docs
          options: { 
            wait_for_model: true,
            use_cache: false
          }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`HuggingFace API Error Details:`, {
          status: response.status,
          statusText: response.statusText,
          url: `${this.baseUrl}/models/${this.model}`,
          errorText: errorText
        });
        const err = new Error(`HuggingFace API error (${response.status}): ${errorText}`) as HuggingFaceError;
        err.code = HuggingFaceErrorCode.API_FAILURE;
        err.retryable = response.status === 429 || response.status >= 500;
        throw err;
      }

      const result = await response.json();
      console.log('HuggingFace API Response type:', typeof result, 'Array?', Array.isArray(result));
      
      // Handle different response formats from HF Inference API
      // For feature extraction, response is typically: [[embedding_vector]]
      if (Array.isArray(result) && result.length > 0) {
        if (Array.isArray(result[0]) && result[0].length > 0) {
          const embedding = result[0]; // First (and typically only) embedding
          console.log(`Generated embedding with ${embedding.length} dimensions`);
          return embedding;
        } else if (typeof result[0] === 'number') {
          // Direct array of numbers
          console.log(`Generated embedding with ${result.length} dimensions`);
          return result;
        }
      }
      
      const err = new Error('Unexpected response format from HuggingFace API') as HuggingFaceError;
      err.code = HuggingFaceErrorCode.INVALID_RESPONSE;
      err.retryable = false;
      console.error('Unexpected HuggingFace API response format:', result);
      throw err;
    } catch (error) {
      console.error('HuggingFace API request failed:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to generate embedding: ${String(error)}`);
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!texts?.length) {
      throw new Error('Texts array cannot be empty');
    }

    // Filter out empty texts
    const validTexts = texts.filter(text => text?.trim());
    if (!validTexts.length) {
      throw new Error('No valid texts provided');
    }

    try {
      // HuggingFace Inference API supports batch processing
      const response = await fetch(`${this.baseUrl}/models/${this.model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: validTexts, // Try array of strings input
          options: { 
            wait_for_model: true,
            use_cache: false
          }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`HuggingFace Batch API Error Details:`, {
          status: response.status,
          statusText: response.statusText,
          url: `${this.baseUrl}/models/${this.model}`,
          errorText: errorText,
          inputCount: validTexts.length
        });
        const err = new Error(`HuggingFace API error (${response.status}): ${errorText}`) as HuggingFaceError;
        err.code = HuggingFaceErrorCode.API_FAILURE;
        err.retryable = response.status === 429 || response.status >= 500;
        throw err;
      }

      const result = await response.json();
      console.log('HuggingFace Batch API Response type:', typeof result, 'Array?', Array.isArray(result));
      
      // For batch processing, result should be array of embeddings: [[emb1], [emb2], ...]
      if (Array.isArray(result)) {
        console.log(`Generated ${result.length} embeddings for ${validTexts.length} texts`);
        return result;
      }
      
      const err = new Error('Unexpected response format from HuggingFace batch API') as HuggingFaceError;
      err.code = HuggingFaceErrorCode.INVALID_RESPONSE;
      err.retryable = false;
      console.error('Unexpected HuggingFace batch API response format:', result);
      throw err;
    } catch (error) {
      console.error('HuggingFace batch API request failed:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to generate batch embeddings: ${String(error)}`);
    }
  }

  getDimensions(): number { 
    return this.dimensions; 
  }
  
  getModel(): string { 
    return this.model; 
  }

  // Test the connection and API key
  async testConnection(): Promise<boolean> {
    try {
      console.log('Testing HuggingFace connection...');
      await this.generateEmbedding('test');
      console.log('HuggingFace connection test successful');
      return true;
    } catch (error) {
      console.error('HuggingFace connection test failed:', error);
      return false;
    }
  }
}

export const huggingface = new HuggingFaceService();
