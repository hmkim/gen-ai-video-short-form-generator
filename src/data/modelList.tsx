// modelList.tsx

export interface ModelOption {
  name: string;
  logo: string;
  modelId: string;
  provider: string;
  disabled?: boolean;
  disabledReason?: string;
}

export const modelOptions: ModelOption[] = [
  // Anthropic — Latest
  {
    name: "Claude Opus 4.6",
    logo: "logos/anthropic-logo.png",
    modelId: "us.anthropic.claude-opus-4-6-v1",
    provider: "Anthropic"
  },
  {
    name: "Claude Sonnet 4.6",
    logo: "logos/anthropic-logo.png",
    modelId: "us.anthropic.claude-sonnet-4-6",
    provider: "Anthropic"
  },
  {
    name: "Claude Opus 4.5",
    logo: "logos/anthropic-logo.png",
    modelId: "us.anthropic.claude-opus-4-5-20251101-v1:0",
    provider: "Anthropic"
  },
  {
    name: "Claude Sonnet 4.5",
    logo: "logos/anthropic-logo.png",
    modelId: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    provider: "Anthropic"
  },
  {
    name: "Claude Haiku 4.5",
    logo: "logos/anthropic-logo.png",
    modelId: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    provider: "Anthropic"
  },
  {
    name: "Claude Opus 4.1",
    logo: "logos/anthropic-logo.png",
    modelId: "us.anthropic.claude-opus-4-1-20250805-v1:0",
    provider: "Anthropic"
  },
  {
    name: "Claude Sonnet 4",
    logo: "logos/anthropic-logo.png",
    modelId: "us.anthropic.claude-sonnet-4-20250514-v1:0",
    provider: "Anthropic"
  },
  {
    name: "Claude 3.7 Sonnet",
    logo: "logos/anthropic-logo.png",
    modelId: "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
    provider: "Anthropic"
  },
  {
    name: "Claude 3.5 Haiku",
    logo: "logos/anthropic-logo.png",
    modelId: "us.anthropic.claude-3-5-haiku-20241022-v1:0",
    provider: "Anthropic"
  },
  // Amazon Nova
  {
    name: "Nova Premier",
    logo: "logos/amazon-logo.png",
    modelId: "us.amazon.nova-premier-v1:0",
    provider: "Amazon"
  },
  {
    name: "Nova Pro",
    logo: "logos/amazon-logo.png",
    modelId: "us.amazon.nova-pro-v1:0",
    provider: "Amazon"
  },
  {
    name: "Nova 2 Lite",
    logo: "logos/amazon-logo.png",
    modelId: "us.amazon.nova-2-lite-v1:0",
    provider: "Amazon"
  },
  {
    name: "Nova Lite",
    logo: "logos/amazon-logo.png",
    modelId: "us.amazon.nova-lite-v1:0",
    provider: "Amazon"
  },
  {
    name: "Nova Micro",
    logo: "logos/amazon-logo.png",
    modelId: "us.amazon.nova-micro-v1:0",
    provider: "Amazon"
  },
  // Meta Llama
  {
    name: "Llama 4 Maverick 17B",
    logo: "logos/meta-logo.png",
    modelId: "us.meta.llama4-maverick-17b-instruct-v1:0",
    provider: "Meta"
  },
  {
    name: "Llama 4 Scout 17B",
    logo: "logos/meta-logo.png",
    modelId: "us.meta.llama4-scout-17b-instruct-v1:0",
    provider: "Meta"
  },
  {
    name: "Llama 3.3 70B",
    logo: "logos/meta-logo.png",
    modelId: "us.meta.llama3-3-70b-instruct-v1:0",
    provider: "Meta"
  },
  // DeepSeek
  {
    name: "DeepSeek R1",
    logo: "logos/deepseek-logo.png",
    modelId: "us.deepseek.r1-v1:0",
    provider: "DeepSeek"
  },
];
