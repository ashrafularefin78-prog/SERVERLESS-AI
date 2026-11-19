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
  {
    id: "gguf:qwen2.5-coder-1.5b-instruct-q4km",
    label: "Qwen2.5 Coder 1.5B Instruct - Q4_K_M (coding, community)",
    url: "https://huggingface.co/bartowski/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/1af47f78b1f9b0c242fabe43f7a365d5a67f3207/Qwen2.5-Coder-1.5B-Instruct-Q4_K_M.gguf",
    downloadBytes: 986048800,
    baseModel: "Qwen2.5 Coder 1.5B",
    note:
      "Community GGUF quantization of the official Qwen2.5 Coder 1.5B Instruct model, tuned for code generation, " +
      "completion and editing. Not an official Qwen release.",
  },
  {
    id: "gguf:qwen2.5-coder-3b-instruct-q4km",
    label: "Qwen2.5 Coder 3B Instruct - Q4_K_M (coding, community)",
    url: "https://huggingface.co/bartowski/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/7c137640ef0332dfedb229f2504c58d83ed4307a/Qwen2.5-Coder-3B-Instruct-Q4_K_M.gguf",
    downloadBytes: 1929903360,
    baseModel: "Qwen2.5 Coder 3B",
    note:
      "Community GGUF quantization of the official Qwen2.5 Coder 3B Instruct model, tuned for code generation, " +
      "completion and editing. Not an official Qwen release.",
  },
  {
    id: "gguf:qwen2.5-coder-7b-instruct-q3km",
    label: "Qwen2.5 Coder 7B Instruct - Q3_K_M (coding, community)",
    url: "https://huggingface.co/bartowski/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/1f629da0c8bed16b9e50cee91c70693650e66c35/Qwen2.5-Coder-7B-Instruct-Q3_K_M.gguf",
    downloadBytes: 3808391968,
    baseModel: "Qwen2.5 Coder 7B",
    note:
      "Community GGUF quantization of the official Qwen2.5 Coder 7B Instruct model, tuned for code generation, " +
      "completion and editing. Q3_K_M keeps the download under 4 GB at some quality cost. Not an official Qwen release. " +
      "Large model: expect slow CPU generation and several GB of free RAM.",
  },
  {
    id: "gguf:llama-3.2-1b-instruct-q4km",
    label: "Llama 3.2 1B Instruct - Q4_K_M (community)",
    url: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/067b946cf014b7c697f3654f621d577a3e3afd1c/Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    downloadBytes: 807694464,
    baseModel: "Llama 3.2 1B",
    note:
      "Community GGUF quantization of Meta's Llama 3.2 1B Instruct model. " +
      "Not an official Meta release. Check the model card for licence and usage terms.",
  },
  {
    id: "gguf:llama-3.2-3b-instruct-q4km",
    label: "Llama 3.2 3B Instruct - Q4_K_M (community)",
    url: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/5ab33fa94d1d04e903623ae72c95d1696f09f9e8/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    downloadBytes: 2019377696,
    baseModel: "Llama 3.2 3B",
    note:
      "Community GGUF quantization of Meta's Llama 3.2 3B Instruct model. " +
      "Not an official Meta release. Check the model card for licence and usage terms.",
  },
  {
    id: "gguf:phi-3.5-mini-instruct-q4km",
    label: "Phi-3.5 mini Instruct - Q4_K_M (community)",
    url: "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/6d70da17e749a471ccb62ade694486011a75cda3/Phi-3.5-mini-instruct-Q4_K_M.gguf",
    downloadBytes: 2393232672,
    baseModel: "Phi-3.5 mini",
    note:
      "Community GGUF quantization of Microsoft's Phi-3.5 mini Instruct model. " +
      "Not an official Microsoft release.",
  },
  {
    id: "gguf:gemma-2-2b-it-q4km",
    label: "Gemma 2 2B IT - Q4_K_M (community)",
    url: "https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/855f67caed130e1befc571b52bd181be2e858883/gemma-2-2b-it-Q4_K_M.gguf",
    downloadBytes: 1708582752,
    baseModel: "Gemma 2 2B",
    note:
      "Community GGUF quantization of Google's Gemma 2 2B IT model. " +
      "Not an official Google release. Check the model card for licence and usage terms.",
  },
  {
    id: "gguf:qwen2.5-3b-instruct-q4km",
    label: "Qwen2.5 3B Instruct - Q4_K_M (community)",
    url: "https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/f302c64a2269a69fb27b2f9473b362f5bb8e78d8/Qwen2.5-3B-Instruct-Q4_K_M.gguf",
    downloadBytes: 1929903264,
    baseModel: "Qwen2.5 3B",
    note:
      "Community GGUF quantization of the official Qwen2.5 3B Instruct model. " +
      "Not an official Qwen release.",
  },
  {
    id: "gguf:qwen2.5-7b-instruct-q3km",
    label: "Qwen2.5 7B Instruct - Q3_K_M (community)",
    url: "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/8911e8a47f92bac19d6f5c64a2e2095bd2f7d031/Qwen2.5-7B-Instruct-Q3_K_M.gguf",
    downloadBytes: 3808391872,
    baseModel: "Qwen2.5 7B",
    note:
      "Community GGUF quantization of the official Qwen2.5 7B Instruct model. " +
      "Q3_K_M keeps the download under 4 GB at some quality cost. Not an official Qwen release. " +
      "Large model: expect slow CPU generation and several GB of free RAM.",
  },
  {
    id: "gguf:smollm2-1.7b-instruct-q4km",
    label: "SmolLM2 1.7B Instruct - Q4_K_M (community)",
    url: "https://huggingface.co/bartowski/SmolLM2-1.7B-Instruct-GGUF/resolve/1f03464768bfcc0319fc50da8ff5fb20b6417ba2/SmolLM2-1.7B-Instruct-Q4_K_M.gguf",
    downloadBytes: 1055609824,
    baseModel: "SmolLM2 1.7B",
    note:
      "Community GGUF quantization of Hugging Face's SmolLM2 1.7B Instruct model. " +
      "Not an official Hugging Face release.",
  },
  {
    id: "gguf:mistral-7b-instruct-v0.3-q3km",
    label: "Mistral 7B Instruct v0.3 - Q3_K_M (community)",
    url: "https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/61fd4167fff3ab01ee1cfe0da183fa27a944db48/Mistral-7B-Instruct-v0.3-Q3_K_M.gguf",
    downloadBytes: 3522941152,
    baseModel: "Mistral 7B Instruct v0.3",
    note:
      "Community GGUF quantization of Mistral AI's Mistral 7B Instruct v0.3 model. " +
      "Q3_K_M keeps the download under 4 GB at some quality cost. Not an official Mistral AI release. " +
      "Large model: expect slow CPU generation and several GB of free RAM.",
  },
  {
    id: "gguf:gemma-2-9b-it-q2k",
    label: "Gemma 2 9B IT - Q2_K (community)",
    url: "https://huggingface.co/bartowski/gemma-2-9b-it-GGUF/resolve/d731033f3dc4018261fd39896e50984d398b4ac5/gemma-2-9b-it-Q2_K.gguf",
    downloadBytes: 3805397952,
    baseModel: "Gemma 2 9B",
    note:
      "Community GGUF quantization of Google's Gemma 2 9B IT model. " +
      "Q2_K keeps the download under 4 GB and lowers quality noticeably. Not an official Google release. " +
      "Check the model card for licence and usage terms. Large model: expect slow CPU generation and several GB of free RAM.",
  },
  {
    id: "gguf:tinyllama-1.1b-chat-q4km",
    label: "TinyLlama 1.1B Chat - Q4_K_M (community)",
    url: "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/52e7645ba7c309695bec7ac98f4f005b139cf465/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
    downloadBytes: 668788096,
    baseModel: "TinyLlama 1.1B",
    note:
      "Community GGUF quantization of the TinyLlama 1.1B Chat model. " +
      "Not an official TinyLlama release.",
  },
  {
    id: "gguf:mistral-7b-instruct-v0.3-abliterated-q3km",
    label: "Mistral 7B Instruct v0.3 abliterated - Q3_K_M (uncensored, community)",
    url: "https://huggingface.co/mradermacher/Mistral-7B-Instruct-v0.3-abliterated-GGUF/resolve/6dc4ce9ecfbf429d5894ad78e878022061a83750/Mistral-7B-Instruct-v0.3-abliterated.Q3_K_M.gguf",
    downloadBytes: 3522945728,
    baseModel: "Mistral 7B Instruct v0.3 abliterated",
    note:
      "Community uncensored build based on Mistral 7B Instruct v0.3: refusal behaviour was removed, so this model is uncensored " +
      "and can produce unsafe or offensive output. Not an official release by the original model vendor. " +
      "Check the model card for licence and usage terms. Large model: expect slow CPU generation and several GB of free RAM.",
    uncensored: true,
  },
  {
    id: "gguf:qwen2.5-0.5b-instruct-q4km",
    label: "Qwen2.5 0.5B Instruct - Q4_K_M (community)",
    url: "https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/41ba88dbac95fed2528c92514c131d73eb5a174b/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf",
    downloadBytes: 397808192,
    baseModel: "Qwen2.5 0.5B",
    note:
      "Community GGUF quantization of the official Qwen2.5 0.5B Instruct model. " +
      "Not an official Qwen release.",
  },
  {
    id: "gguf:qwen2.5-1.5b-instruct-q4km",
    label: "Qwen2.5 1.5B Instruct - Q4_K_M (community)",
    url: "https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/9eadc66189c7641e1ddd226b8267a9119b2ce2d4/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",
    downloadBytes: 986048768,
    baseModel: "Qwen2.5 1.5B",
    note:
      "Community GGUF quantization of the official Qwen2.5 1.5B Instruct model. " +
      "Not an official Qwen release.",
  },
  {
    id: "gguf:deepseek-r1-distill-qwen-1.5b-q4km",
    label: "DeepSeek R1 Distill Qwen 1.5B - Q4_K_M (community)",
    url: "https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/9cc28b17e86fa2415fcb070f8ee5ec27c965aa61/DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf",
    downloadBytes: 1117320800,
    baseModel: "DeepSeek R1 Distill Qwen 1.5B",
    note:
      "Community GGUF quantization of DeepSeek's R1 Distill Qwen 1.5B reasoning model. " +
      "Not an official DeepSeek release.",
  },
  {
    id: "gguf:granite-3.2-2b-instruct-q4km",
    label: "Granite 3.2 2B Instruct - Q4_K_M (community)",
    url: "https://huggingface.co/ibm-research/granite-3.2-2b-instruct-GGUF/resolve/153d944aab8ce9c56ddcedbafc1a682341651f11/granite-3.2-2b-instruct-Q4_K_M.gguf",
    downloadBytes: 1545296256,
    baseModel: "Granite 3.2 2B",
    note:
      "Community GGUF quantization of IBM's Granite 3.2 2B Instruct model. " +
      "Not an official IBM release.",
  },
  {
    id: "gguf:olmo-2-1b-instruct-q4km",
    label: "OLMo 2 1B Instruct - Q4_K_M (community)",
    url: "https://huggingface.co/allenai/OLMo-2-0425-1B-Instruct-GGUF/resolve/62f8c199538474c3e33ed5d7e0580abd66686a27/OLMo-2-0425-1B-Instruct-Q4_K_M.gguf",
    downloadBytes: 935515296,
    baseModel: "OLMo 2 1B",
    note:
      "Community GGUF quantization of AI2's OLMo 2 1B Instruct model. " +
      "Not an official Allen Institute for AI release.",
  },
  {
    id: "gguf:qwen3-4b-instruct-2507-q4km",
    label: "Qwen3 4B Instruct 2507 - Q4_K_M (community)",
    url: "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/a06e946bb6b655725eafa393f4a9745d460374c9/Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
    downloadBytes: 2497281120,
    baseModel: "Qwen3 4B",
    note:
      "Community GGUF quantization of the official Qwen3 4B Instruct 2507 model. " +
      "Not an official Qwen release.",
  },
  {
    id: "gguf:falcon3-3b-instruct-q4km",
    label: "Falcon3 3B Instruct - Q4_K_M (community)",
    url: "https://huggingface.co/bartowski/Falcon3-3B-Instruct-GGUF/resolve/1053f43c269a0b2c9d8ed304b94c2f727bb649ad/Falcon3-3B-Instruct-Q4_K_M.gguf",
    downloadBytes: 2005684480,
    baseModel: "Falcon3 3B",
    note:
      "Community GGUF quantization of TII's Falcon3 3B Instruct model. " +
      "Not an official TII release.",
  },
  {
    id: "gguf:yi-1.5-6b-chat-q4km",
    label: "Yi 1.5 6B Chat - Q4_K_M (community)",
    url: "https://huggingface.co/bartowski/Yi-1.5-6B-Chat-GGUF/resolve/d91a0cede594cb9f627e4601b8660b55d09dd3c2/Yi-1.5-6B-Chat-Q4_K_M.gguf",
    downloadBytes: 3673968736,
    baseModel: "Yi 1.5 6B",
    note:
      "Community GGUF quantization of 01.AI's Yi 1.5 6B Chat model. " +
      "Not an official 01.AI release. Large model: expect slow CPU generation and several GB of free RAM.",
  },
  {
    id: "gguf:granite-3.2-2b-instruct-abliterated-q4km",
    label: "Granite 3.2 2B Instruct abliterated - Q4_K_M (uncensored, community)",
    url: "https://huggingface.co/mradermacher/granite-3.2-2b-instruct-abliterated-GGUF/resolve/2e3caef2aa1dcc79700925be4597b2d7d38885b1/granite-3.2-2b-instruct-abliterated.Q4_K_M.gguf",
    downloadBytes: 1545296384,
    baseModel: "Granite 3.2 2B abliterated",
    note:
      "Community uncensored build based on Granite 3.2 2B Instruct: refusal behaviour was removed, so this model is uncensored " +
      "and can produce unsafe or offensive output. Not an official IBM release. Check the model card for licence and usage terms.",
    uncensored: true,
  },
];

// Featured, hand-picked builds first, followed by the generated uncensored
// catalogue. The generated entries are deduplicated against the featured list.
export const COMMUNITY_MODELS: CommunityModel[] = [
  ...FEATURED_COMMUNITY_MODELS,
  ...GENERATED_COMMUNITY_MODELS,
];
