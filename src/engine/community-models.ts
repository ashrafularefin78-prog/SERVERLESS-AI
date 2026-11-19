import { GENERATED_COMMUNITY_MODELS } from "./community-generated.js";

export interface CommunityModel {
  id: string;
  label: string;
  url: string;
  downloadBytes: number;
  baseModel: string;
  note: string;
  uncensored?: boolean;
}

const FEATURED_COMMUNITY_MODELS: CommunityModel[] = [
  {
    id: "gguf:qwen2.5-coder-1.5b-abliterated-q4km",
    label: "Qwen2.5 Coder 1.5B Abliterated - Q4_K_M (uncensored coding, community)",
    url: "https://huggingface.co/bartowski/Qwen2.5-Coder-1.5B-Instruct-abliterated-GGUF/resolve/823ab8183896816dec7d29899310b556e655ad73/Qwen2.5-Coder-1.5B-Instruct-abliterated-Q4_K_M.gguf",
    downloadBytes: 1117321696,
    baseModel: "Qwen2.5 Coder 1.5B",
    note:
      "Community abliterated build: refusal behaviour was removed, so this model is uncensored and can produce unsafe or offensive output. " +
      "Not an official Qwen release.",
    uncensored: true,
  },
  {
    id: "gguf:qwen2.5-coder-3b-abliterated-q4km",
    label: "Qwen2.5 Coder 3B Abliterated - Q4_K_M (uncensored coding, community)",
    url: "https://huggingface.co/bartowski/Qwen2.5-Coder-3B-Instruct-abliterated-GGUF/resolve/d3030e6c3380c87316eeb6b35cdf5c94a68f1986/Qwen2.5-Coder-3B-Instruct-abliterated-Q4_K_M.gguf",
    downloadBytes: 1929903488,
    baseModel: "Qwen2.5 Coder 3B",
    note:
      "Community abliterated build: refusal behaviour was removed, so this model is uncensored and can produce unsafe or offensive output. " +
      "Not an official Qwen release.",
    uncensored: true,
  },
  {
    id: "gguf:deepseek-r1-distill-qwen-1.5b-abliterated-q4km",
    label: "DeepSeek R1 Distill Qwen 1.5B Abliterated - Q4_K_M (uncensored, community)",
    url: "https://huggingface.co/mradermacher/DeepSeek-R1-Distill-Qwen-1.5B-abliterated-GGUF/resolve/b4c8f307c8040a1697c035419688c929ea421cb6/DeepSeek-R1-Distill-Qwen-1.5B-abliterated.Q4_K_M.gguf",
    downloadBytes: 1117321504,
    baseModel: "DeepSeek R1 Distill Qwen 1.5B",
    note:
      "Community abliterated build: refusal behaviour was removed, so this model is uncensored and can produce unsafe or offensive output. " +
      "Not an official DeepSeek release.",
    uncensored: true,
  },
  {
    id: "gguf:deepseek-r1-distill-qwen-1.5b-abliterated-dpo-q4km",
    label: "DeepSeek R1 Distill Qwen 1.5B Abliterated DPO - Q4_K_M (uncensored, community)",
    url: "https://huggingface.co/mradermacher/DeepSeek-R1-Distill-Qwen-1.5B-Abliterated-dpo-GGUF/resolve/c2eed88a6cf34ee019ec8c270e1d0406e0f818c6/DeepSeek-R1-Distill-Qwen-1.5B-Abliterated-dpo.Q4_K_M.gguf",
    downloadBytes: 1117321408,
    baseModel: "DeepSeek R1 Distill Qwen 1.5B",
    note:
      "Community abliterated and DPO-tuned build: refusal behaviour was removed, so this model is uncensored and can produce unsafe or offensive output. " +
      "Not an official DeepSeek release.",
    uncensored: true,
  },
  {
    id: "gguf:qwen3-1.7b-abliterated-q4km",
    label: "Qwen3 1.7B Abliterated - Q4_K_M (uncensored, community)",
    url: "https://huggingface.co/mradermacher/Qwen3-1.7B-abliterated-GGUF/resolve/b87b1df5ecc209db872fed3e8a3ca5e1fd76c02a/Qwen3-1.7B-abliterated.Q4_K_M.gguf",
    downloadBytes: 1107409024,
    baseModel: "Qwen3 1.7B",
    note:
      "Community abliterated build: refusal behaviour was removed, so this model is uncensored and can produce unsafe or offensive output. " +
      "Not an official Qwen release.",
    uncensored: true,
  },
  {
    id: "gguf:dolphin3.0-llama3.2-3b-q4ks",
    label: "Dolphin 3.0 Llama 3.2 3B - Q4_K_S (uncensored, community)",
    url: "https://huggingface.co/bartowski/Dolphin3.0-Llama3.2-3B-GGUF/resolve/ac6b1ee98e3864ebd5998216f800a07d74b166b5/Dolphin3.0-Llama3.2-3B-Q4_K_S.gguf",
    downloadBytes: 1928205440,
    baseModel: "Llama 3.2 3B",
    note:
      "Community uncensored build trained by Cognitive Computations on coding and general instruction data. " +
      "It can produce unsafe or offensive output. Not an official Meta Llama release.",
    uncensored: true,
  },
  {
    id: "gguf:deepseek-r1-distill-qwen-7b-abliterated-q2k",
    label: "DeepSeek R1 Distill Qwen 7B Abliterated - Q2_K (uncensored, community)",
    url: "https://huggingface.co/mradermacher/DeepSeek-R1-Distill-Qwen-7B-abliterated-GGUF/resolve/d40ce128cccf1f2b7dcfa1cce1e8656725567567/DeepSeek-R1-Distill-Qwen-7B-abliterated.Q2_K.gguf",
    downloadBytes: 3015940672,
    baseModel: "DeepSeek R1 Distill Qwen 7B",
    note:
      "Community abliterated build: refusal behaviour was removed, so this model is uncensored and can produce unsafe or offensive output. " +
      "Not an official DeepSeek release. Large model: expect slow CPU generation and several GB of free RAM.",
    uncensored: true,
  },
  {
    id: "gguf:deepseek-r1-distill-llama-8b-abliterated-q2k",
    label: "DeepSeek R1 Distill Llama 8B Abliterated - Q2_K (uncensored, community)",
    url: "https://huggingface.co/mradermacher/DeepSeek-R1-Distill-Llama-8B-Abliterated-GGUF/resolve/035c64034ed57f3b47009f3793162c02ec88f508/DeepSeek-R1-Distill-Llama-8B-Abliterated.Q2_K.gguf",
    downloadBytes: 3179134528,
    baseModel: "DeepSeek R1 Distill Llama 8B",
    note:
      "Community abliterated build: refusal behaviour was removed, so this model is uncensored and can produce unsafe or offensive output. " +
      "Not an official DeepSeek release. Large model: expect slow CPU generation and several GB of free RAM.",
    uncensored: true,
  },
  {
    id: "gguf:mimo-v2.6-distill-qwen-9b-ara-abliterated-q2k",
    label: "MiMo V2.6 Distill Qwen 9B ARA Abliterated - Q2_K (uncensored coding, community)",
    url: "https://huggingface.co/mradermacher/MiMo-V2.6-Distill-Qwen-9B-ARA-Abliterated-GGUF/resolve/ff02122486d9665fae301fe2532d88723fd94b6e/MiMo-V2.6-Distill-Qwen-9B-ARA-Abliterated.Q2_K.gguf",
    downloadBytes: 3827259744,
    baseModel: "MiMo V2.6 Distill Qwen 9B",
    note:
      "Community ARA-abliterated build: refusal behaviour was removed, so this model is uncensored and can produce unsafe or offensive output. " +
      "Not an official Xiaomi release. Large model: expect slow CPU generation and several GB of free RAM.",
    uncensored: true,
  },
  {
    id: "gguf:mimo-v2.6-distill-qwen-9b-heretic-q2k",
    label: "MiMo V2.6 Distill Qwen 9B Heretic - Q2_K (uncensored coding, community)",
    url: "https://huggingface.co/mradermacher/MiMo-V2.6-Distill-Qwen-9B-heretic-GGUF/resolve/4e642ce6d23ee0130bdf57cfe64d644008c042ee/MiMo-V2.6-Distill-Qwen-9B-heretic.Q2_K.gguf",
    downloadBytes: 3827259776,
    baseModel: "MiMo V2.6 Distill Qwen 9B",
    note:
      "Community decensored (heretic) build: safety refusal behaviour was removed, so this model is uncensored and can produce unsafe or offensive output. " +
      "Not an official Xiaomi release. Large model: expect slow CPU generation and several GB of free RAM.",
    uncensored: true,
  },
  {
    id: "gguf:qwen3-0.6b-claude-opus-4.7-q4km",
    label: "Qwen3 0.6B Distill Q4_K_M (community)",
    url: "https://huggingface.co/mradermacher/Qwen-3-0.6B-Claude-4.7-Opus-Distilled-GGUF/resolve/ceef756cf2b44b0638114faa59ffb94b5e8cbff7/Qwen-3-0.6B-Claude-4.7-Opus-Distilled.Q4_K_M.gguf",
    downloadBytes: 396706560,
    baseModel: "Qwen3 0.6B",
    note: "Community derivative of Qwen3 0.6B, not an official Anthropic Claude model.",
  },
  {
    id: "gguf:qwen3-0.6b-claude-coder-q4km",
    label: "Qwen3 0.6B Coder Q4_K_M (community)",
    url: "https://huggingface.co/mradermacher/Qwen3-0.6B-Claude-Coder-GGUF/resolve/e0675ae07bd1a687eb60e79df9fcc097b38a6820/Qwen3-0.6B-Claude-Coder.Q4_K_M.gguf",
    downloadBytes: 396706208,
    baseModel: "Qwen3 0.6B",
    note: "Community derivative of Qwen3 0.6B, not an official Anthropic Claude model.",
  },
  {
    id: "gguf:qwen2.5-1.5b-claude-dpo-q4km",
    label: "Qwen2.5 1.5B DPO Q4_K_M (community)",
    url: "https://huggingface.co/mradermacher/Qwen2.5-1.5B-Claude-Dpo-GGUF/resolve/d4c1d1ac99d4246497065e9e91e1c2665bf114ef/Qwen2.5-1.5B-Claude-Dpo.Q4_K_M.gguf",
    downloadBytes: 986048864,
    baseModel: "Qwen2.5 1.5B",
    note: "Community derivative of Qwen2.5 1.5B, not an official Anthropic Claude model.",
  },
  {
    id: "gguf:qwen3-1.7b-claude-condense-q4km",
    label: "Qwen3 1.7B Condense Q4_K_M (community)",
    url: "https://huggingface.co/mradermacher/Claude4.6-Qwen3-1.7B-CoNDeNse-GGUF/resolve/46a5bff40d36a58668188a53f250be78da306bc7/Claude4.6-Qwen3-1.7B-CoNDeNse.Q4_K_M.gguf",
    downloadBytes: 1107410208,
    baseModel: "Qwen3 1.7B",
    note: "Community derivative of Qwen3 1.7B, not an official Anthropic Claude model.",
  },
];

// Featured, hand-picked builds first, followed by the generated uncensored
// catalogue. The generated entries are deduplicated against the featured list.
export const COMMUNITY_MODELS: CommunityModel[] = [
  ...FEATURED_COMMUNITY_MODELS,
  ...GENERATED_COMMUNITY_MODELS,
];
