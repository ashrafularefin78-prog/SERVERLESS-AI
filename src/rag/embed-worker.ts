// Embedding worker. Transformers.js loads all-MiniLM-L6-v2 through ONNX
// Runtime Web on the CPU, so embedding a document never blocks the chat UI and
// never needs WebGPU.
import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

env.allowLocalModels = false;

// Xenova's export uses the `model_quantized.onnx` layout Transformers.js maps
// `dtype: "q8"` to. The onnx-community export uses external data files instead.
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

interface EmbedRequest {
  type: "embed";
  id: number;
  texts: string[];
}

interface WorkerProgress {
  status?: string;
  file?: string;
  loaded?: number;
  total?: number;
}

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: unknown) => void;
};

function getExtractor(): Promise<FeatureExtractionPipeline> {
  extractorPromise ??= pipeline("feature-extraction", MODEL_ID, {
    dtype: "q8",
    progress_callback: (event: WorkerProgress) => {
      if (event?.status !== "progress" && event?.status !== "download") return;
      scope.postMessage({
        type: "progress",
        file: event.file ?? "",
        loaded: event.loaded ?? 0,
        total: event.total ?? 0,
      });
    },
  });
  return extractorPromise;
}

scope.onmessage = (event: MessageEvent) => {
  const data = event.data as EmbedRequest | undefined;
  if (data?.type !== "embed" || !Array.isArray(data.texts)) return;

  void (async () => {
    try {
      const extractor = await getExtractor();
      const output = await extractor(data.texts, { pooling: "mean", normalize: true });
      const vectors = output.tolist() as number[][];
      scope.postMessage({ type: "result", id: data.id, vectors });
    } catch (error) {
      scope.postMessage({
        type: "error",
        id: data.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })();
};
