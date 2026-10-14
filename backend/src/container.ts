import type pg from "pg";
import { ApiKeyService } from "./auth/api-keys.js";
import { UserIdentityService } from "./auth/user-identity.js";
import { loadConfig, type AppConfig } from "./config.js";
import { JobQueue } from "./db/jobs.js";
import { InterviewStore } from "./db/interview-store.js";
import { ContentStore } from "./db/content-store.js";
import { ReviewStore } from "./db/review-store.js";
import { createPool } from "./db/pool.js";
import { ProductStore } from "./db/product-store.js";
import { Store } from "./db/store.js";
import { WorkflowStore } from "./db/workflow-store.js";
import { EmailDeliveryService } from "./email/delivery.js";
import { MockProvider } from "./llm/mock-provider.js";
import { OpenAIProvider } from "./llm/openai-provider.js";
import type { LlmProvider } from "./llm/provider.js";
import { MemoryAssembler } from "./memory/assembler.js";
import { ObsidianExporter } from "./obsidian/exporter.js";
import { MetricsService } from "./observability/metrics.js";
import { PerformanceTracer } from "./observability/performance.js";
import { OrchestrationService } from "./orchestration/service.js";
import { RecipeRegistry } from "./orchestration/recipes/catalog.js";
import { PromptCompiler } from "./skills/prompt-compiler.js";
import { SkillReleaseStore } from "./skills/release-store.js";
import { SkillRegistry } from "./skills/registry.js";
import { ToolRegistry } from "./tools/registry.js";

import { InterviewService } from "./interview/service.js";
import { MockOptionAssistantAdapter, OpenAIOptionAssistantAdapter } from "./interview/options/adapter.js";
import { InterviewOptionCache } from "./interview/options/cache.js";
import { OptionAssistantService } from "./interview/options/service.js";
import { RunProgressService } from "./orchestration/progress.js";

export type Container = {
  config: AppConfig;
  pool: pg.Pool;
  store: Store;
  contentStore: ContentStore;
  reviewStore: ReviewStore;
  productStore: ProductStore;
  workflowStore: WorkflowStore;
  interviewStore: InterviewStore;
  interview: InterviewService;
  optionAssistant: OptionAssistantService;
  optionCache: InterviewOptionCache;
  queue: JobQueue;
  registry: SkillRegistry;
  recipes: RecipeRegistry;
  releases: SkillReleaseStore;
  memory: MemoryAssembler;
  tools: ToolRegistry;
  compiler: PromptCompiler;
  llm: LlmProvider;
  orchestration: OrchestrationService;
  runProgress: RunProgressService;
  obsidian: ObsidianExporter | null;
  apiKeys: ApiKeyService;
  userIdentities: UserIdentityService;
  emailDelivery: EmailDeliveryService;
  metrics: MetricsService;
  performance: PerformanceTracer;
};

export async function buildContainer(overrides?: {
  config?: AppConfig;
  pool?: pg.Pool;
  llm?: LlmProvider;
}): Promise<Container> {
  const config: AppConfig = overrides?.config ?? loadConfig();
  const pool = overrides?.pool ?? createPool(config);
  const runProgress = new RunProgressService(pool);
  const store = new Store(pool, runProgress);
  const contentStore = new ContentStore(pool);
  const reviewStore = new ReviewStore(pool);
  const productStore = new ProductStore(pool);
  const workflowStore = new WorkflowStore(pool);
  const interviewStore = new InterviewStore(pool);
  const metrics = new MetricsService(pool);
  const performance = new PerformanceTracer(metrics, config.PERFORMANCE_TRACE_SAMPLE_RATE);
  const registry = new SkillRegistry(config.SKILLS_ROOT);
  await registry.load();
  const recipes = new RecipeRegistry();
  recipes.validate(registry);
  const releases = new SkillReleaseStore(pool);
  await releases.register(registry.bundle(), recipes);
  const compiler = new PromptCompiler(config.SKILLS_ROOT, config.MAX_CONTEXT_CHARS);
  const memory = new MemoryAssembler(
    config.MEMORY_CONTEXT_MAX_CHARS,
    config.MEMORY_CONVERSATION_MAX_CHARS,
  );
  const tools = new ToolRegistry(store, config.MAX_TOOL_RESULT_BYTES);
  const llm =
    overrides?.llm ??
    (config.LLM_PROVIDER === "openai"
      ? new OpenAIProvider(config.OPENAI_API_KEY as string, config.OPENAI_MODEL, {
          ...(config.OPENAI_BASE_URL ? { baseURL: config.OPENAI_BASE_URL } : {}),
          timeoutMs: config.OPENAI_TIMEOUT_MS,
          maxRetries: config.OPENAI_MAX_RETRIES,
          maxOutputTokens: config.OPENAI_MAX_OUTPUT_TOKENS,
        })
      : new MockProvider());
  const queue = new JobQueue(
    pool,
    config.WORKER_ID,
    config.WORKER_LEASE_SECONDS,
    config.WORKER_MAX_CONCURRENT_JOBS_PER_ORGANIZATION,
    runProgress,
    config.QUEUE_MAX_ACTIVE_JOBS,
    config.QUEUE_MAX_ACTIVE_JOBS_PER_ORGANIZATION,
  );
  const orchestration = new OrchestrationService(
    config,
    store,
    reviewStore,
    workflowStore,
    registry,
    recipes,
    releases,
    memory,
    tools,
    compiler,
    llm,
    performance,
    interviewStore,
    runProgress,
  );
  const obsidian = config.OBSIDIAN_EXPORT_ROOT
    ? new ObsidianExporter(
        config.OBSIDIAN_EXPORT_ROOT,
        store,
        config.OBSIDIAN_MAX_EXPORT_FILES,
        config.OBSIDIAN_MAX_EXPORT_BYTES,
      )
    : null;
  const apiKeys = new ApiKeyService(pool);
  const userIdentities = new UserIdentityService(pool, config);
  const emailDelivery = new EmailDeliveryService(config);
  const optionCache = new InterviewOptionCache(pool);
  const optionAdapter = config.LLM_PROVIDER === "openai" && config.OPENAI_API_KEY
    ? new OpenAIOptionAssistantAdapter(
        config.OPENAI_API_KEY,
        config.OPENAI_MODEL,
        config.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
        config.OPTION_ASSISTANT_TIMEOUT_MS,
      )
    : new MockOptionAssistantAdapter();
  const optionAssistant = new OptionAssistantService(
    interviewStore,
    optionCache,
    optionAdapter,
    performance,
    queue,
    config.OPTION_ASSISTANT_CACHE_TTL_MS,
    config.OPTION_ASSISTANT_TIMEOUT_MS,
    config.OPTION_ASSISTANT_INPUT_COST_MICRO_USD_PER_MILLION,
    config.OPTION_ASSISTANT_OUTPUT_COST_MICRO_USD_PER_MILLION,
  );
  const interview = new InterviewService(
    interviewStore,
    performance,
    optionAssistant,
    config.GUIDED_INTAKE_ENABLED,
  );

  return {
    config,
    pool,
    store,
    contentStore,
    reviewStore,
    productStore,
    workflowStore,
    interviewStore,
    interview,
    optionAssistant,
    optionCache,
    queue,
    registry,
    recipes,
    releases,
    memory,
    tools,
    compiler,
    llm,
    orchestration,
    runProgress,
    obsidian,
    apiKeys,
    userIdentities,
    emailDelivery,
    metrics,
    performance,
  };
}
